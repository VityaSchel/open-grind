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

const readProperties = async (file: string): Promise<Map<string, string>> =>
	new Map(
		(await Bun.file(path.join(root, file)).text())
			.split("\n")
			.filter((line) => !line.startsWith("#") && line.includes("="))
			.map((line) => {
				const separator = line.indexOf("=");
				return [line.slice(0, separator), line.slice(separator + 1)];
			}),
	);

const requireKey = (properties: Map<string, string>, key: string): string => {
	const value = properties.get(key);
	if (!value) throw new Error(`no ${key} in the toolchain pins`);
	return value;
};

const toolchainInputs = [
	"flake.lock",
	"rust-toolchain.toml",
	"src-tauri/gen/android/gradle.properties",
];

const readToolchain = async (
	commit: string,
): Promise<Record<string, string>> => {
	const changed = (
		await $`git -C ${root} diff --name-only ${commit} -- ${toolchainInputs}`.text()
	).trim();
	if (changed) {
		throw new Error(
			`${commit} builds with a different toolchain (${changed.replaceAll("\n", ", ")}); render its recipe from a checkout of it`,
		);
	}
	const pins = await readProperties("ci/fdroid/toolchain.properties");
	const android = await readProperties(
		"src-tauri/gen/android/gradle.properties",
	);
	const rustVersion = (
		await Bun.file(path.join(root, "rust-toolchain.toml")).text()
	).match(/^channel = "(.+)"$/m)?.[1];
	if (!rustVersion) throw new Error("rust-toolchain.toml has no channel");
	return {
		nodeVersion: requireKey(pins, "node.version"),
		nodeSha256: requireKey(pins, "node.sha256"),
		bunVersion: requireKey(pins, "bun.version"),
		bunSha256: requireKey(pins, "bun.sha256"),
		libclangMajor: requireKey(pins, "libclang.version").split(".")[0],
		rustVersion,
		compileSdk: requireKey(android, "opengrind.android.compileSdk"),
		buildTools: requireKey(android, "opengrind.android.buildTools"),
		cmakeVersion: requireKey(android, "opengrind.android.cmake"),
		ndkVersion: requireKey(android, "opengrind.android.ndk"),
	};
};

const recipe = async ({
	commit,
	conf,
}: {
	commit: string;
	conf: TauriConf;
}): Promise<string> => {
	const values = {
		versionName: conf.version,
		versionCode: conf.bundle.android.versionCode.toString(),
		commit,
		...(await readToolchain(commit)),
	};
	const rendered = Object.entries(values).reduce(
		(text, [key, value]) => text.replaceAll(`\${${key}}`, value),
		recipeTemplate,
	);
	const unfilled = rendered.match(/\$\{[A-Za-z0-9]+\}/);
	if (unfilled)
		throw new Error(`recipe template leaves ${unfilled[0]} unset`);
	return rendered;
};

const withoutReferenceBinary = (rendered: string): string =>
	rendered.replace(/^Binaries:.*\n/m, "");

if (process.argv[2] === "emit") {
	const ref = process.argv[3];
	if (!ref) throw new Error("usage: fdroid.ts emit <tag|commit>");
	const commit = await resolveCommit(ref);
	process.stdout.write(
		await recipe({ commit, conf: await readConf(commit) }),
	);
	process.exit(0);
}

const sha = await resolveCommit(process.env.FORGEJO_SHA ?? "HEAD");
const conf = await readConf(sha);
const versionCode = conf.bundle.android.versionCode;
console.log(
	`>>> commit=${sha} versionName=${conf.version} versionCode=${versionCode}`,
);

const fdd = await mkdtemp(path.join(tmpdir(), "fdroid-"));
await Bun.write(
	path.join(fdd, "metadata", `${APPID}.yml`),
	withoutReferenceBinary(await recipe({ commit: sha, conf })),
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
			.replaceAll("${versionCode}", versionCode.toString())
			.replaceAll("${commit}", sha)
			.replaceAll("${repoUrl}", repoUrl),
	);
await $`docker run --rm -v ${fdd}:/repo ${IMAGE} bash -lc ${buildScript}`;

const apks: string[] = [];
for await (const path of new Bun.Glob("**/release/*.apk").scan({
	cwd: fdd,
	absolute: true,
})) {
	apks.push(path);
}
apks.sort();
const [apk] = apks;
if (!apk) {
	console.error("fdroid build produced no APK");
	process.exit(1);
}

const out = path.join(root, "fdroid-out", path.basename(apk));
await Bun.write(out, Bun.file(apk));
const digest = new Bun.CryptoHasher("sha256")
	.update(await Bun.file(out).bytes())
	.digest("hex");
console.log(">>> F-Droid build sha256 (APK uploaded as workflow artifact):");
console.log(`${digest}  ${out}`);
