#!/usr/bin/env bun
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createZstdCompress, createZstdDecompress } from "node:zlib";

const CACHED_PATHS = [".ci-cache/cargo", "src-tauri/target"];
const LOCKFILE = "src-tauri/Cargo.lock";

const { CACHE_ENDPOINT, CACHE_BUCKET, CACHE_ACCESS_KEY, CACHE_SECRET_KEY } =
	process.env;
if (!CACHE_ENDPOINT || !CACHE_BUCKET || !CACHE_ACCESS_KEY || !CACHE_SECRET_KEY)
	throw new Error(
		"CACHE_ENDPOINT, CACHE_BUCKET, CACHE_ACCESS_KEY and CACHE_SECRET_KEY must be set",
	);

const bucket = new Bun.S3Client({
	accessKeyId: CACHE_ACCESS_KEY,
	secretAccessKey: CACHE_SECRET_KEY,
	endpoint: CACHE_ENDPOINT,
	bucket: CACHE_BUCKET,
	region: "auto",
});

async function cacheKey(): Promise<string> {
	const lockfile = Bun.file(LOCKFILE);
	if (!(await lockfile.exists())) throw new Error(`${LOCKFILE} not found`);
	const digest = new Bun.CryptoHasher("sha256")
		.update(await lockfile.bytes())
		.digest("hex");
	return `check-${digest.slice(0, 16)}.tar.zst`;
}

async function tar(args: string[]): Promise<void> {
	const proc = Bun.spawn(["tar", ...args], {
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await proc.exited) !== 0) throw new Error("tar failed");
}

async function restore(): Promise<void> {
	const key = await cacheKey();
	const object = bucket.file(key);
	if (!(await object.exists())) {
		console.log(`cache miss: ${key}`);
		return;
	}
	const work = await mkdtemp(join(tmpdir(), "cache-"));
	try {
		const compressed = join(work, "cache.tar.zst");
		const archive = join(work, "cache.tar");
		await Bun.write(compressed, object);
		await pipeline(
			createReadStream(compressed),
			createZstdDecompress(),
			createWriteStream(archive),
		);
		await tar(["-xf", archive]);
		console.log(`cache hit: ${key}`);
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

async function save(): Promise<void> {
	const present: string[] = [];
	for (const path of CACHED_PATHS)
		if (
			await stat(path).then(
				() => true,
				() => false,
			)
		)
			present.push(path);
	if (present.length === 0) {
		console.log("nothing to cache");
		return;
	}
	const key = await cacheKey();
	const work = await mkdtemp(join(tmpdir(), "cache-"));
	try {
		const archive = join(work, "cache.tar");
		const compressed = join(work, "cache.tar.zst");
		await tar(["-cf", archive, ...present]);
		await pipeline(
			createReadStream(archive),
			createZstdCompress(),
			createWriteStream(compressed),
		);
		await bucket.file(key).write(Bun.file(compressed));
		console.log(`cache saved: ${key}`);
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

const command = process.argv[2];
if (command === "restore") await restore();
else if (command === "save") await save();
else {
	console.error("usage: cache.ts restore|save");
	process.exit(2);
}
