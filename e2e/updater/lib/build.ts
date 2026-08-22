import { $ } from "bun";

import {
	androidAbi,
	bundleName,
	cache,
	cachedApk,
	cachedBundle,
	identifier,
	keystoreProperties,
	repo,
	state,
} from "./config";

export async function sourceStamp(): Promise<string> {
	const listing = Bun.spawnSync(
		["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
		{ cwd: repo },
	);
	if (!listing.success) throw new Error(`git ls-files failed in ${repo}`);
	const paths = listing.stdout.toString().split("\0").filter(Boolean);
	const hasher = new Bun.CryptoHasher("sha256");
	for (const path of paths.sort()) {
		const info = await Bun.file(`${repo}/${path}`)
			.stat()
			.catch(() => null);
		if (!info) continue;
		hasher.update(`${path}:${info.size}:${info.mtimeMs}\n`);
	}
	return hasher.digest("hex");
}

export async function buildBundle({
	version,
	force = false,
}: {
	version: string;
	force?: boolean;
}): Promise<string> {
	const bundle = cachedBundle(version);
	const stampPath = `${cache}/${version}.stamp`;
	const stamp = `${identifier}:${version}:${await sourceStamp()}`;
	const cached = await Bun.file(stampPath)
		.text()
		.catch(() => null);
	const present = await Bun.file(`${bundle}/Contents/Info.plist`).exists();

	if (!force && present && cached === stamp) {
		console.log(`  ${version}: up to date`);
		return bundle;
	}

	console.log(`  ${version}: building…`);
	await $`bun run tauri build --debug --bundles app --config ${JSON.stringify({ identifier, version })}`.cwd(
		repo,
	);

	await $`rm -rf ${bundle}`;
	await $`ditto ${repo}/src-tauri/target/debug/bundle/macos/${bundleName} ${bundle}`;
	await Bun.write(stampPath, stamp);
	return bundle;
}

export async function placeRunnable({
	version,
	at,
}: {
	version: string;
	at: string;
}): Promise<void> {
	await $`chmod -R u+w ${at}`.nothrow().quiet();
	await $`rm -rf ${at}`;
	await $`ditto ${cachedBundle(version)} ${at}`;
}

export async function ensureState(): Promise<void> {
	await $`mkdir -p ${state}`;
}

const project = "src-tauri/gen/android";
const manifest = `${repo}/${project}/app/src/main/AndroidManifest.xml`;
const keystore = `${repo}/${project}/keystore.properties`;
const output = `${repo}/${project}/app/build/outputs/apk/universal/debug/app-universal-debug.apk`;

export async function clearKeystore(): Promise<void> {
	await Bun.file(keystore)
		.delete()
		.catch(() => undefined);
}

export async function buildApk({
	version,
	versionCode,
	force = false,
}: {
	version: string;
	versionCode: number;
	force?: boolean;
}): Promise<string> {
	const apk = cachedApk(version);
	const stampPath = `${cache}/android/${version}.stamp`;
	const stamp = `${version}:${versionCode}:${androidAbi}:${await sourceStamp()}`;
	const cached = await Bun.file(stampPath)
		.text()
		.catch(() => null);

	if (!force && cached === stamp && (await Bun.file(apk).exists())) {
		console.log(`  ${version} (${versionCode}): up to date`);
		return apk;
	}

	if (!(await Bun.file(keystoreProperties).exists())) {
		throw new Error(
			`${keystoreProperties} not found — the debug build has to carry the release signature or InstallGate answers ForeignSigner and never offers an update`,
		);
	}

	console.log(`  ${version} (${versionCode}): building…`);
	const pristineManifest = await Bun.file(manifest).text();
	await Bun.write(keystore, Bun.file(keystoreProperties));
	try {
		await $`bun run tauri android build --debug --apk --target ${androidAbi} --config ${JSON.stringify(
			{ version, bundle: { android: { versionCode } } },
		)}`.cwd(repo);
	} finally {
		await Bun.file(keystore)
			.delete()
			.catch(() => undefined);
		if ((await Bun.file(manifest).text()) !== pristineManifest) {
			await Bun.write(manifest, pristineManifest);
		}
	}

	await $`mkdir -p ${cache}/android`;
	await Bun.write(apk, Bun.file(output));
	await Bun.write(stampPath, stamp);
	return apk;
}
