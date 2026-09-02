#!/usr/bin/env bun
import { join } from "node:path";

const [downloads, out] = process.argv.slice(2);

// Longest prefix first: an arm64 upload directory also starts with the generic one.
const FLEETS = [
	{
		prefix: "open-grind-unsigned-linux-arm64-",
		boxes: JSON.parse(process.env.ARM_BOXES ?? "[]") as string[],
	},
	{
		prefix: "open-grind-unsigned-",
		boxes: JSON.parse(process.env.BOXES ?? "[]") as string[],
	},
];

if (!downloads || !out || FLEETS.every(({ boxes }) => boxes.length === 0)) {
	console.error(
		"usage: BOXES=<json array> ARM_BOXES=<json array> verify.ts <downloads dir> <output dir>",
	);
	process.exit(2);
}

const byName = new Map<string, { paths: string[]; expected: number }>();
for await (const entry of new Bun.Glob(
	"open-grind-unsigned-*/*.{apk,deb,exe,AppImage}",
).scan({ cwd: downloads })) {
	const [dir = "", name = ""] = entry.split("/");
	const fleet = FLEETS.find(({ prefix }) => dir.startsWith(prefix));
	if (!fleet) {
		console.error(`no fleet owns ${dir}`);
		process.exit(1);
	}
	const group = byName.get(name) ?? {
		paths: [],
		expected: fleet.boxes.length,
	};
	group.paths.push(join(downloads, entry));
	byName.set(name, group);
}
if (byName.size === 0) {
	console.error(`no artifacts under ${downloads}`);
	process.exit(1);
}

for (const [name, { paths, expected }] of byName) {
	paths.sort();
	const [first] = paths;
	if (!first || paths.length !== expected) {
		console.error(
			`expected ${expected} copies of ${name}, got ${paths.length}`,
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
		console.error(`copies of ${name} are not byte-identical`);
		process.exit(1);
	}

	await Bun.write(join(out, name), Bun.file(first));
}
