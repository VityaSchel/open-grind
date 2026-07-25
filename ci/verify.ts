#!/usr/bin/env bun
import { basename, join } from "node:path";

const [downloads, out] = process.argv.slice(2);
const expected = JSON.parse(process.env.BOXES ?? "[]") as string[];
if (!downloads || !out || expected.length === 0) {
	console.error(
		"usage: BOXES=<json array> verify.ts <downloads dir> <output dir>",
	);
	process.exit(2);
}

const apks: string[] = [];
for await (const path of new Bun.Glob("open-grind-unsigned-*/*.apk").scan({
	cwd: downloads,
	absolute: true,
}))
	apks.push(path);
apks.sort();

const [first] = apks;
if (!first || apks.length !== expected.length) {
	console.error(`expected ${expected.length} APKs, got ${apks.length}`);
	process.exit(1);
}

const digests = await Promise.all(
	apks.map(async (path) => {
		const digest = new Bun.CryptoHasher("sha256")
			.update(await Bun.file(path).bytes())
			.digest("hex");
		console.log(`${digest}  ${path}`);
		return digest;
	}),
);

if (new Set(digests).size !== 1) {
	console.error("APKs are not byte-identical");
	process.exit(1);
}

await Bun.write(join(out, basename(first)), Bun.file(first));
