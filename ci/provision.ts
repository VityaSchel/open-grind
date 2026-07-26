#!/usr/bin/env bun
import { appendFile } from "node:fs/promises";

import {
	type Box,
	BOX_LIFETIME_MINUTES,
	BUILDERS,
	CHECK,
	CHECK_LABEL,
	FORGEJO,
	REPO,
	RUNNER_SHA256,
	RUNNER_VERSION,
	SSH_KEY,
	STATE_BUCKET,
	WARM,
	WARM_LABEL,
} from "./config.ts";

const SINGLE = {
	check: { box: CHECK, label: CHECK_LABEL },
	warm: { box: WARM, label: WARM_LABEL },
};

// Builders install Nix from cloud-init, which routinely outruns 10 minutes.
const ONLINE_TIMEOUT_MS = 15 * 60_000;

const mode = process.argv[2];
const builder = mode === "build" || mode === "fdroid" || mode === "names";
const single = SINGLE[mode as keyof typeof SINGLE];
const singleName = process.env.TF_VAR_name;
const requested = (process.env.BOXES ?? "").split(/\s+/).filter(Boolean);
const unknown = requested.filter(
	(provider) => !BUILDERS.some((box) => box.provider === provider),
);
if (builder && unknown.length > 0)
	throw new Error(`unknown builders requested: ${unknown.join(" ")}`);
const boxes: Box[] = builder
	? BUILDERS.filter((box) => requested.includes(box.provider))
	: single && singleName
		? [{ ...single.box, name: singleName }]
		: [];
if (boxes.length === 0) {
	console.error(
		"usage: BOXES=<provider …> provision.ts build|fdroid|names | TF_VAR_name=<box> provision.ts check|warm",
	);
	process.exit(2);
}

// Forgejo drops a failed job's outputs, so the matrix reads this from names.
// Build still writes it too, or an older build.yml gets no matrix and leaks.
if ((mode === "names" || mode === "build") && process.env.GITHUB_OUTPUT)
	await appendFile(
		process.env.GITHUB_OUTPUT,
		`boxes=${JSON.stringify(boxes.map((box) => box.name))}\n`,
	);
if (mode === "names") process.exit(0);

const registration = process.env.RUNNER_REGISTRATION_TOKEN;
if (!registration) throw new Error("RUNNER_REGISTRATION_TOKEN is not set");

const setup = builder
	? await Bun.file(
			`${import.meta.dir}/${mode === "fdroid" ? "fdroid/setup.sh" : "setup-build.sh"}`,
		).text()
	: "";

function cloudInit(
	label: string,
	runner: { uuid: string; token: string },
): string {
	const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
	return `#!/bin/bash
set -euo pipefail
export HOME=/root
shutdown +${BOX_LIFETIME_MINUTES}
${setup}
curl -fsSL -o /usr/local/bin/forgejo-runner \\
	"https://code.forgejo.org/forgejo/runner/releases/download/v${RUNNER_VERSION}/forgejo-runner-${RUNNER_VERSION}-linux-amd64"
echo "${RUNNER_SHA256}  /usr/local/bin/forgejo-runner" | sha256sum -c -
chmod +x /usr/local/bin/forgejo-runner
install -d -m 0700 /etc/open-grind
umask 077
printf '%s' ${quote(runner.token)} > /etc/open-grind/runner-token
systemd-run --collect --unit=open-grind-runner \\
	/usr/local/bin/forgejo-runner one-job --url ${quote(FORGEJO)} --uuid ${quote(runner.uuid)} \\
	--token-url file:///etc/open-grind/runner-token --label ${quote(`${label}:host`)} --wait
`;
}

async function registerRunner(
	name: string,
): Promise<{ id: number; uuid: string; token: string }> {
	const response = await fetch(
		`${FORGEJO}/api/v1/repos/${REPO}/actions/runners`,
		{
			method: "POST",
			headers: {
				Authorization: `token ${registration}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name, ephemeral: true }),
		},
	);
	if (!response.ok)
		throw new Error(`registering runner ${name}: ${response.status}`);
	return response.json() as Promise<{
		id: number;
		uuid: string;
		token: string;
	}>;
}

async function waitOnline(runnerId: number, name: string): Promise<void> {
	for (let waited = 0; waited < ONLINE_TIMEOUT_MS; waited += 15_000) {
		await Bun.sleep(15_000);
		const response = await fetch(
			`${FORGEJO}/api/v1/repos/${REPO}/actions/runners/${runnerId}`,
			{ headers: { Authorization: `token ${registration}` } },
		);
		const status = response.ok
			? ((await response.json()) as { status?: string }).status
			: `HTTP ${response.status}`;
		console.log(
			`${name}: runner ${status ?? "unknown"} after ${waited / 1000}s`,
		);
		if (status === "idle" || status === "active") return;
	}
	throw new Error(
		`${name}: runner never came online within ${ONLINE_TIMEOUT_MS / 60_000}m of cloud-init`,
	);
}

async function terraform(
	box: Box,
	args: string[],
	vars: Record<string, string> = {},
): Promise<boolean> {
	const proc = Bun.spawn(
		[
			"terraform",
			`-chdir=${import.meta.dir}/terraform/${box.provider}`,
			...args,
		],
		{ env: { ...process.env, ...vars }, stdout: "inherit", stderr: "inherit" },
	);
	return (await proc.exited) === 0;
}

const APPLY = ["apply", "-auto-approve", "-input=false"];
const DESTROY = ["destroy", "-auto-approve", "-input=false"];

const placedRunners: { id: number; name: string }[] = [];
for (const box of boxes) {
	const init = await terraform(box, [
		"init",
		"-input=false",
		"-reconfigure",
		`-backend-config=bucket=${STATE_BUCKET}`,
		`-backend-config=key=${box.provider}/${box.name}.tfstate`,
	]);
	if (!init) throw new Error(`terraform init failed for ${box.name}`);

	if (!(await terraform(box, DESTROY, { TF_VAR_name: box.name })))
		throw new Error(`destroying leftover state of ${box.name} failed`);

	// One registration per box, not per placement attempt: a rejected attempt
	// never boots the box, so its runner record would just linger offline.
	const runner = await registerRunner(box.name);
	const userData = cloudInit(single?.label ?? box.name, runner);
	let placed = "";
	for (const plan of box.plans) {
		for (const location of box.locations) {
			const attempt = {
				TF_VAR_name: box.name,
				TF_VAR_plan: plan,
				TF_VAR_location: location,
				TF_VAR_ssh_key: SSH_KEY,
				TF_VAR_user_data: userData,
			};
			if (await terraform(box, APPLY, attempt)) {
				placed = `${plan} in ${location}`;
				placedRunners.push({ id: runner.id, name: box.name });
				break;
			}
			if (!(await terraform(box, DESTROY, attempt)))
				throw new Error(`cleanup of failed ${box.name} attempt failed`);
		}
		if (placed) break;
	}
	if (!placed)
		throw new Error(
			`${box.name}: every ${box.provider} plan and location was rejected — see the provider errors above, which are not always about capacity`,
		);
	console.log(`${box.name}: ${placed}`);
}

await Promise.all(placedRunners.map(({ id, name }) => waitOnline(id, name)));
