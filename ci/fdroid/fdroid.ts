#!/usr/bin/env bun
import { $ } from "bun";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type TauriConf = {
	version: string;
	bundle: { android: { versionCode: number } };
};

const APPID = "org.opengrind";
const RUST_TARGETS: Record<string, string> = {
	"armeabi-v7a": "armv7",
	"arm64-v8a": "aarch64",
	x86: "i686",
	x86_64: "x86_64",
};
const IMAGE = "registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie";
const root = path.join(import.meta.dir, "../..");

const recipeTemplate = await Bun.file(
	path.join(root, "ci/fdroid/org.opengrind.yml"),
).text();

const repoUrl = recipeTemplate.match(/^Repo:\s*(\S+)/m)?.[1];
if (!repoUrl) throw new Error("recipe template has no Repo:");

const resolveCommit = (ref: string): Promise<string> =>
	$`git -C ${root} rev-parse --verify ${`${ref}^{commit}`}`
		.text()
		.then((s) => s.trim())
		.catch(() => {
			throw new Error(
				`cannot resolve ${ref} — create the release tag first, or pass a commit`,
			);
		});

const readConf = async (commit: string): Promise<TauriConf> =>
	JSON.parse(
		await $`git -C ${root} show ${`${commit}:src-tauri/tauri.conf.json`}`.text(),
	);

const readProperty = async ({
	commit,
	file,
	key,
}: {
	commit: string;
	file: string;
	key: string;
}): Promise<string> => {
	const text = await $`git -C ${root} show ${`${commit}:${file}`}`
		.quiet()
		.text()
		.catch(() => {
			throw new Error(
				`${commit} has no ${file}, so its recipe has to inline the build`,
			);
		});
	const value = text.match(
		new RegExp(`^${key.replaceAll(".", "\\.")}=(.+)$`, "m"),
	)?.[1];
	if (!value) throw new Error(`${file} at ${commit} has no ${key}`);
	return value;
};

type Split = { abi: string; offset: number };

const readSplits = async (commit: string): Promise<Split[]> =>
	(
		await readProperty({
			commit,
			file: "src-tauri/gen/android/gradle.properties",
			key: "opengrind.android.abiVersionCodeOffsets",
		})
	)
		.split(",")
		.map((entry) => {
			const [abi = "", offset = ""] = entry.split(":");
			return { abi, offset: Number(offset) };
		})
		.sort((a, b) => a.offset - b.offset);

const fill = (text: string, values: Record<string, string>): string =>
	Object.entries(values).reduce(
		(filled, [key, value]) => filled.replaceAll(`\${${key}}`, value),
		text,
	);

const recipe = async ({
	commit,
	conf,
	splits,
}: {
	commit: string;
	conf: TauriConf;
	splits: Split[];
}): Promise<string> => {
	const libclangVersion = await readProperty({
		commit,
		file: "ci/fdroid/toolchain.properties",
		key: "libclang.version",
	});
	const libclangMajor = libclangVersion.match(/^\d+(?=\.|$)/)?.[0];
	if (!libclangMajor)
		throw new Error(
			`libclang.version ${libclangVersion} has no major version`,
		);
	const baseCode = conf.bundle.android.versionCode;
	const entry = recipeTemplate.match(/^Builds:\n((?: {2}.*\n)+)/m)?.[1];
	if (!entry) throw new Error("recipe template has no Builds entry");
	const builds = splits
		.map(({ abi, offset }) => {
			const rustTarget = RUST_TARGETS[abi];
			if (!rustTarget) throw new Error(`no Rust target builds ${abi}`);
			return fill(entry, {
				abi,
				rustTarget,
				versionCode: String(baseCode + offset),
			});
		})
		.join("\n");
	const values = {
		versionName: conf.version,
		currentVersionCode: String(
			baseCode + Math.max(...splits.map(({ offset }) => offset)),
		),
		vercodeOperations: splits
			.map(({ offset }) => `'%c + ${offset}'`)
			.join("\n  - "),
		commit,
		ndkVersion: await readProperty({
			commit,
			file: "src-tauri/gen/android/gradle.properties",
			key: "opengrind.android.ndk",
		}),
		libclangMajor,
	};
	const rendered = fill(
		recipeTemplate.replace(entry, () => builds),
		values,
	);
	const unfilled = rendered.match(/\$\{[A-Za-z0-9]+\}/);
	if (unfilled)
		throw new Error(`recipe template leaves ${unfilled[0]} unset`);
	return rendered;
};

const withoutReferenceBinaries = (rendered: string): string =>
	rendered.replace(/^ {4}binary:.*\n/gm, "");

if (process.argv[2] === "emit") {
	const ref = process.argv[3];
	if (!ref) throw new Error("usage: fdroid.ts emit <tag|commit>");
	const commit = await resolveCommit(ref);
	process.stdout.write(
		await recipe({
			commit,
			conf: await readConf(commit),
			splits: await readSplits(commit),
		}),
	);
	process.exit(0);
}

const sha = await resolveCommit(process.env.FORGEJO_SHA ?? "HEAD");
const conf = await readConf(sha);
const splits = await readSplits(sha);
const baseCode = conf.bundle.android.versionCode;
console.log(
	`>>> commit=${sha} versionName=${conf.version} versionCode=${baseCode}`,
);

const fdd = await mkdtemp(path.join(tmpdir(), "fdroid-"));
await Bun.write(
	path.join(fdd, "metadata", `${APPID}.yml`),
	withoutReferenceBinaries(await recipe({ commit: sha, conf, splits })),
);

await $`docker pull ${IMAGE}`;
console.log(
	`>>> image ${await $`docker inspect --format "{{index .RepoDigests 0}}" ${IMAGE}`.text()}`,
);
console.log(">>> fdroid build from source (--on-server runs the sudo: block)");
const buildScript = await Bun.file(path.join(root, "ci/fdroid/build.sh"))
	.text()
	.then((s) =>
		s
			.replaceAll("${APPID}", APPID)
			.replaceAll("${commit}", sha)
			.replaceAll("${repoUrl}", repoUrl),
	);
await $`docker run --rm -v ${fdd}:/repo ${IMAGE} bash -lc ${buildScript}`;

console.log(">>> F-Droid build sha256 (APKs uploaded as workflow artifact):");
for (const { abi, offset } of splits) {
	const built = path.join(fdd, "tmp", `${APPID}_${baseCode + offset}.apk`);
	if (!(await Bun.file(built).exists())) {
		console.error(`fdroid build produced no ${abi} APK at ${built}`);
		process.exit(1);
	}
	const out = path.join(
		root,
		"fdroid-out",
		`open-grind-v${conf.version}-android-${abi}-unsigned.apk`,
	);
	await Bun.write(out, Bun.file(built));
	const digest = new Bun.CryptoHasher("sha256")
		.update(await Bun.file(out).bytes())
		.digest("hex");
	console.log(`${digest}  ${out}`);
}
