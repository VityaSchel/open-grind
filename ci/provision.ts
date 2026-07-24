#!/usr/bin/env bun
import { appendFile } from "node:fs/promises";

import {
	type Box,
	BOX_LIFETIME_MINUTES,
	BUILDERS,
	CHECK,
	FORGEJO,
	REPO,
	RUNNER_SHA256,
	RUNNER_VERSION,
	STATE_BUCKET,
} from "./config.ts";

const mode = process.argv[2];
const checkName = process.env.TF_VAR_name;
const requested = (process.env.BOXES ?? "").split(/\s+/).filter(Boolean);
const unknown = requested.filter(
	(provider) => !BUILDERS.some((box) => box.provider === provider),
);
if (mode === "build" && unknown.length > 0)
	throw new Error(`unknown builders requested: ${unknown.join(" ")}`);
const boxes: Box[] =
	mode === "build"
		? BUILDERS.filter((box) => requested.includes(box.provider))
		: mode === "check" && checkName
			? [{ ...CHECK, name: checkName }]
			: [];
if (boxes.length === 0) {
	console.error(
		"usage: BOXES=<provider …> provision.ts build | TF_VAR_name=<box> provision.ts check",
	);
	process.exit(2);
}

const registration = process.env.RUNNER_REGISTRATION_TOKEN;
if (!registration) throw new Error("RUNNER_REGISTRATION_TOKEN is not set");

const BUILDER_SETUP = `
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git
. /etc/os-release
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin nodejs
`;

function cloudInit(
	name: string,
	runner: { uuid: string; token: string },
): string {
	const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
	return `#!/bin/bash
set -euo pipefail
shutdown +${BOX_LIFETIME_MINUTES}
${mode === "build" ? BUILDER_SETUP : ""}
curl -fsSL -o /usr/local/bin/forgejo-runner \\
	"https://code.forgejo.org/forgejo/runner/releases/download/v${RUNNER_VERSION}/forgejo-runner-${RUNNER_VERSION}-linux-amd64"
echo "${RUNNER_SHA256}  /usr/local/bin/forgejo-runner" | sha256sum -c -
chmod +x /usr/local/bin/forgejo-runner
install -d -m 0700 /etc/open-grind
umask 077
printf '%s' ${quote(runner.token)} > /etc/open-grind/runner-token
systemd-run --collect --unit=open-grind-runner \\
	/usr/local/bin/forgejo-runner one-job --url ${quote(FORGEJO)} --uuid ${quote(runner.uuid)} \\
	--token-url file:///etc/open-grind/runner-token --label ${quote(`${name}:host`)} --wait
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

async function waitOnline(runnerId: number): Promise<void> {
	for (let waited = 0; waited < 600_000; waited += 15_000) {
		await Bun.sleep(15_000);
		const response = await fetch(
			`${FORGEJO}/api/v1/repos/${REPO}/actions/runners/${runnerId}`,
			{ headers: { Authorization: `token ${registration}` } },
		);
		if (!response.ok) continue;
		const { status } = (await response.json()) as { status?: string };
		if (status === "idle" || status === "active") return;
	}
	throw new Error("runner never came online");
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

const placedRunners: number[] = [];
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

	let placed = "";
	for (const plan of box.plans) {
		for (const location of box.locations) {
			const runner = await registerRunner(box.name);
			const attempt = {
				TF_VAR_name: box.name,
				TF_VAR_plan: plan,
				TF_VAR_location: location,
				TF_VAR_user_data: cloudInit(box.name, runner),
			};
			if (await terraform(box, APPLY, attempt)) {
				placed = `${plan} in ${location}`;
				placedRunners.push(runner.id);
				break;
			}
			if (!(await terraform(box, DESTROY, attempt)))
				throw new Error(`cleanup of failed ${box.name} attempt failed`);
		}
		if (placed) break;
	}
	if (!placed) throw new Error(`no ${box.provider} capacity for ${box.name}`);
	console.log(`${box.name}: ${placed}`);
}

await Promise.all(placedRunners.map((runnerId) => waitOnline(runnerId)));

if (mode === "build" && process.env.GITHUB_OUTPUT)
	await appendFile(
		process.env.GITHUB_OUTPUT,
		`boxes=${JSON.stringify(boxes.map((box) => box.name))}\n`,
	);
