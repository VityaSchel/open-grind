#!/usr/bin/env bun
import {
	BOX_LIFETIME_MINUTES,
	BUILDERS,
	CHECK,
	FORGEJO,
	REPO,
	STATE_BUCKET,
} from "./config.ts";

const registration = process.env.RUNNER_REGISTRATION_TOKEN;
if (!registration) throw new Error("RUNNER_REGISTRATION_TOKEN is not set");

const state = new Bun.S3Client({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	endpoint: process.env.AWS_ENDPOINT_URL_S3,
	region: process.env.AWS_REGION,
	bucket: STATE_BUCKET,
});

interface Target {
	provider: string;
	name: string;
	aged?: boolean;
}

async function agedTargets(): Promise<Target[]> {
	const cutoff = Date.now() - BOX_LIFETIME_MINUTES * 60_000;
	const objects = (await state.list())?.contents ?? [];
	return objects
		.filter(
			(object) =>
				object.lastModified && new Date(object.lastModified).getTime() < cutoff,
		)
		.flatMap((object) => {
			const [provider = "", name = ""] = object.key
				.replace(/\.tfstate$/, "")
				.split("/");
			return provider && name ? [{ provider, name, aged: true }] : [];
		});
}

const mode = process.argv[2];
const checkName = process.env.TF_VAR_name;
const own: Target[] =
	mode === "build"
		? BUILDERS.map((box) => ({ provider: box.provider, name: box.name }))
		: mode === "check" && checkName
			? [{ provider: CHECK.provider, name: checkName }]
			: [];
if (own.length === 0 && mode !== "sweep") {
	console.error(
		"usage: teardown.ts build | TF_VAR_name=<box> teardown.ts check | teardown.ts sweep",
	);
	process.exit(2);
}
const aged = (await agedTargets())
	.filter(
		(target) => mode !== "check" || target.name.startsWith("open-grind-check-"),
	)
	.filter(
		(target) =>
			!own.some(
				(candidate) =>
					candidate.provider === target.provider &&
					candidate.name === target.name,
			),
	);
const targets = [...own, ...aged];

async function terraform(target: Target, args: string[]): Promise<boolean> {
	const proc = Bun.spawn(
		[
			"terraform",
			`-chdir=${import.meta.dir}/terraform/${target.provider}`,
			...args,
		],
		{
			env: { ...process.env, TF_VAR_name: target.name },
			stdout: "inherit",
			stderr: "inherit",
		},
	);
	return (await proc.exited) === 0;
}

async function deleteRunnerRecords(name: string): Promise<void> {
	const headers = { Authorization: `token ${registration}` };
	const response = await fetch(
		`${FORGEJO}/api/v1/repos/${REPO}/actions/runners?limit=100`,
		{ headers },
	);
	if (!response.ok) throw new Error(`listing runners: ${response.status}`);
	const runners = (await response.json()) as { id: number; name: string }[];
	for (const runner of runners)
		if (runner.name === name) {
			const deleted = await fetch(
				`${FORGEJO}/api/v1/repos/${REPO}/actions/runners/${runner.id}`,
				{ method: "DELETE", headers },
			);
			if (!deleted.ok)
				throw new Error(`deleting runner ${runner.id}: ${deleted.status}`);
		}
}

async function stillAged(key: string): Promise<boolean> {
	const cutoff = Date.now() - BOX_LIFETIME_MINUTES * 60_000;
	const objects = (await state.list({ prefix: key }))?.contents ?? [];
	const object = objects.find((candidate) => candidate.key === key);
	return (
		!!object?.lastModified && new Date(object.lastModified).getTime() < cutoff
	);
}

let failed = false;
for (const target of targets) {
	const key = `${target.provider}/${target.name}.tfstate`;
	try {
		if (target.aged && !(await stillAged(key))) {
			console.log(`${target.name}: state refreshed meanwhile, skipping`);
			continue;
		}
		const destroyed =
			(await terraform(target, [
				"init",
				"-input=false",
				"-reconfigure",
				`-backend-config=bucket=${STATE_BUCKET}`,
				`-backend-config=key=${key}`,
			])) &&
			(await terraform(target, ["destroy", "-auto-approve", "-input=false"]));
		if (!destroyed) throw new Error(`destroy failed, state kept at ${key}`);
		await state.delete(key);
		console.log(`${target.name}: destroyed`);
	} catch (error) {
		console.error(`${target.name}: ${String(error)}`);
		failed = true;
	}
	try {
		await deleteRunnerRecords(target.name);
	} catch (error) {
		console.error(
			`${target.name}: runner record cleanup failed: ${String(error)}`,
		);
		failed = true;
	}
}
if (failed) process.exit(1);
