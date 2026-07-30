#!/usr/bin/env bun
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createZstdCompress, createZstdDecompress } from "node:zlib";

const CACHED_PATHS = ["cargo", "target"];
// Cargo refingerprints the restored tree so cache from a different lock rebuilds the delta rather than missing
const KEY = "check-cargo.tar.zst";

const {
	CHECKS_CACHE_S3_ENDPOINT,
	CHECKS_CACHE_S3_BUCKET,
	CHECKS_CACHE_S3_ACCESS_KEY,
	CHECKS_CACHE_S3_SECRET_KEY,
	CHECKS_CACHE_DIR,
} = process.env;
if (
	!CHECKS_CACHE_S3_ENDPOINT ||
	!CHECKS_CACHE_S3_BUCKET ||
	!CHECKS_CACHE_S3_ACCESS_KEY ||
	!CHECKS_CACHE_S3_SECRET_KEY ||
	!CHECKS_CACHE_DIR
) {
	const missing =
		"CHECKS_CACHE_S3_ENDPOINT, CHECKS_CACHE_S3_BUCKET, CHECKS_CACHE_S3_ACCESS_KEY, CHECKS_CACHE_S3_SECRET_KEY and CHECKS_CACHE_DIR must be set";
	if (process.argv[2] === "restore") {
		console.warn(`cache restore skipped: ${missing}`);
		process.exit(0);
	}
	throw new Error(missing);
}
const root: string = CHECKS_CACHE_DIR;

const bucket = new Bun.S3Client({
	accessKeyId: CHECKS_CACHE_S3_ACCESS_KEY,
	secretAccessKey: CHECKS_CACHE_S3_SECRET_KEY,
	endpoint: CHECKS_CACHE_S3_ENDPOINT,
	bucket: CHECKS_CACHE_S3_BUCKET,
	region: "auto",
});

async function restored(): Promise<string[]> {
	const found: string[] = [];
	for (const entry of CACHED_PATHS)
		if (
			await stat(path.join(root, entry)).then(
				() => true,
				() => false,
			)
		)
			found.push(entry);
	return found;
}

async function tar(args: string[]): Promise<void> {
	const proc = Bun.spawn(["tar", ...args], {
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await proc.exited) !== 0) throw new Error("tar failed");
}

async function restore(): Promise<void> {
	const object = bucket.file(KEY);
	if (!(await object.exists())) {
		console.log(`cache miss: ${KEY}`);
		return;
	}
	const work = await mkdtemp(path.join(tmpdir(), "cache-"));
	try {
		const compressed = path.join(work, "cache.tar.zst");
		const archive = path.join(work, "cache.tar");
		await Bun.write(compressed, object);
		await pipeline(
			createReadStream(compressed),
			createZstdDecompress(),
			createWriteStream(archive),
		);
		await mkdir(root, { recursive: true });
		await tar(["-C", root, "-xf", archive]);
		const found = await restored();
		if (found.length === 0)
			throw new Error(
				`${KEY} holds none of ${CACHED_PATHS.join(", ")} — it predates the cache layout, re-run the warm workflow to rewrite it`,
			);
		console.log(`cache hit: ${KEY} (${found.join(", ")})`);
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

async function save(): Promise<void> {
	const present = await restored();
	if (present.length === 0) {
		console.log("nothing to cache");
		return;
	}
	const work = await mkdtemp(path.join(tmpdir(), "cache-"));
	try {
		const archive = path.join(work, "cache.tar");
		const compressed = path.join(work, "cache.tar.zst");
		await tar(["-C", root, "-cf", archive, ...present]);
		await pipeline(
			createReadStream(archive),
			createZstdCompress(),
			createWriteStream(compressed),
		);
		await bucket.file(KEY).write(Bun.file(compressed));
		console.log(`cache saved: ${KEY} (${present.join(", ")})`);
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

const command = process.argv[2];
if (command === "restore") {
	await restore();
} else if (command === "save") {
	await save();
} else {
	console.error("usage: cache.ts restore|save");
	process.exit(2);
}
