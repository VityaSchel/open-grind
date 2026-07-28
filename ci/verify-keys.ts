#!/usr/bin/env bun
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
	FORGEJO,
	GOVERNANCE_FINGERPRINT,
	GOVERNANCE_KEY,
	REPO,
} from "./config.ts";

const fail = (message: string): never => {
	console.error(`\x1b[31merror\x1b[0m: ${message}`);
	process.exit(1);
};

const sha = process.env.FORGEJO_SHA;
if (!sha) fail("FORGEJO_SHA is not set");

const home = mkdtempSync(join(tmpdir(), "open-grind-keys-"));

async function gpg(args: string[], stdin?: Uint8Array) {
	const proc = Bun.spawn(["gpg", "--batch", ...args], {
		env: { ...process.env, GNUPGHOME: home },
		stdin: stdin ? "pipe" : "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const sink = proc.stdin;
	if (stdin && sink) {
		await sink.write(stdin);
		await sink.end();
	}
	const [out, err] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { code: await proc.exited, out, err };
}

async function fetchBytes(url: string) {
	const response = await fetch(url);
	if (!response.ok) fail(`${url} returned ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
}

try {
	const imported = await gpg(["--import"], await fetchBytes(GOVERNANCE_KEY));
	if (imported.code !== 0) fail(`could not import the key: ${imported.err}`);

	const listed = await gpg(["--with-colons", "--fingerprint"]);
	const fingerprint = listed.out
		.split("\n")
		.find((line) => line.startsWith("fpr:"))
		?.split(":")[9];
	if (fingerprint !== GOVERNANCE_FINGERPRINT) {
		fail(
			`${GOVERNANCE_KEY} serves ${fingerprint}, expected ${GOVERNANCE_FINGERPRINT}`,
		);
	}

	const raw = `${FORGEJO}/${REPO}/raw/commit/${sha}`;
	await Bun.write(join(home, "KEYS.md"), await fetchBytes(`${raw}/KEYS.md`));
	await Bun.write(
		join(home, "KEYS.md.asc"),
		await fetchBytes(`${raw}/KEYS.md.asc`),
	);

	const verified = await gpg([
		"--verify",
		join(home, "KEYS.md.asc"),
		join(home, "KEYS.md"),
	]);
	if (verified.code !== 0) {
		console.error(verified.err.trim());
		fail(
			"KEYS.md does not match its signature, re-sign it with:\n" +
				"  gpg --armor --detach-sign --output KEYS.md.asc KEYS.md",
		);
	}
	console.log(verified.err.trim());
} finally {
	rmSync(home, { recursive: true, force: true });
}
