#!/usr/bin/env bun
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const input = process.argv[2];
const output = process.argv[3] ?? "open-grind-signed.apk";
if (!input) {
	console.error("usage: sign.ts <unsigned.apk> [out.apk]");
	process.exit(2);
}
for (const binary of ["apksigner", "zipalign"])
	if (!Bun.which(binary)) {
		console.error(`${binary} not found, run inside 'nix develop'`);
		process.exit(1);
	}

const propertiesPath = process.env.OPEN_GRIND_KEYSTORE_PROPERTIES;
if (!propertiesPath)
	throw new Error("OPEN_GRIND_KEYSTORE_PROPERTIES is not set");
const properties = new Map(
	(await Bun.file(propertiesPath).text())
		.split("\n")
		.filter((line) => line.includes("="))
		.map((line) => {
			const separator = line.indexOf("=");
			return [
				line.slice(0, separator).trim(),
				line.slice(separator + 1).trim(),
			];
		}),
);
const store = properties.get("storeFile");
const alias = properties.get("keyAlias");
const password = properties.get("password");
if (!store || !alias || !password)
	throw new Error(
		"keystore properties must include storeFile, keyAlias and password",
	);

async function run(cmd: string[]): Promise<void> {
	const proc = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" });
	if ((await proc.exited) !== 0) throw new Error(`${cmd[0]} failed`);
}

const aligned = join(tmpdir(), `open-grind-${process.pid}.apk`);
try {
	await run(["zipalign", "-p", "-f", "4", input, aligned]);
	await run([
		"apksigner",
		"sign",
		"--ks",
		store.replace(/^~/, process.env.HOME ?? "~"),
		"--ks-key-alias",
		alias,
		"--ks-pass",
		`pass:${password}`,
		"--key-pass",
		`pass:${password}`,
		"--out",
		output,
		aligned,
	]);
	const verify = Bun.spawn(["apksigner", "verify", "--print-certs", output], {
		stdout: "pipe",
	});
	const certs = await new Response(verify.stdout).text();
	if ((await verify.exited) !== 0) throw new Error("apksigner verify failed");
	const fingerprint = certs
		.split("\n")
		.find((line) => line.includes("SHA-256"));
	if (!fingerprint)
		throw new Error("no certificate fingerprint in verify output");
	console.log(fingerprint);
	console.log(`signed: ${output}`);
} finally {
	await rm(aligned, { force: true });
}
