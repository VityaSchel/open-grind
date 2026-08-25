#!/usr/bin/env bun
import { basename, extname, join } from "node:path";

const [downloads, out] = process.argv.slice(2);
const expected = JSON.parse(process.env.BOXES ?? "[]") as string[];
if (!downloads || !out || expected.length === 0) {
	console.error(
		"usage: BOXES=<json array> verify.ts <downloads dir> <output dir>",
	);
	process.exit(2);
}

const byKind = new Map<string, string[]>();
for await (const path of new Bun.Glob("open-grind-unsigned-*/*.{apk,deb}").scan(
	{ cwd: downloads, absolute: true },
)) {
	const kind = extname(path);
	byKind.set(kind, [...(byKind.get(kind) ?? []), path]);
}
if (byKind.size === 0) {
	console.error(`no artifacts under ${downloads}`);
	process.exit(1);
}

for (const [kind, paths] of byKind) {
	paths.sort();
	const [first] = paths;
	if (!first || paths.length !== expected.length) {
		console.error(
			`expected ${expected.length} ${kind} files, got ${paths.length}`,
		);
		process.exit(1);
	}

	const digests = await Promise.all(
		paths.map(async (path) => {
			const digest = new Bun.CryptoHasher("sha256")
				.update(await Bun.file(path).bytes())
				.digest("hex");
			console.log(`${digest}  ${path}`);
			return digest;
		}),
	);

	if (new Set(digests).size !== 1) {
		console.error(`${kind} files are not byte-identical`);
		process.exit(1);
	}

	await Bun.write(join(out, basename(first)), Bun.file(first));
}
