#!/usr/bin/env bun
import { $ } from "bun";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const APPID = "org.opengrind";
const IMAGE = "registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie";
const root = path.join(import.meta.dir, "../..");

const conf: { version: string; bundle: { android: { versionCode: number } } } =
	await Bun.file(path.join(root, "src-tauri/tauri.conf.json")).json();
const versionName = conf.version;
const versionCode = conf.bundle.android.versionCode;

const recipeTemplate = await Bun.file(
	path.join(root, "ci/fdroid/org.opengrind.yml"),
).text();

const repoUrl = recipeTemplate.match(/^Repo:\s*(\S+)/m)?.[1];
if (!repoUrl) throw new Error("recipe template has no Repo:");

const recipe = (commit: string): string =>
	recipeTemplate
		.replaceAll("${versionName}", versionName)
		.replaceAll("${versionCode}", versionCode.toString())
		.replaceAll("${commit}", commit);

const withoutReferenceBinary = (rendered: string): string =>
	rendered.replace(/^Binaries:.*\n/m, "");

if (process.argv[2] === "emit") {
	const ref = process.argv[3] ?? `v${versionName}`;
	const commit = await $`git rev-parse --verify "${ref}^{commit}"`
		.text()
		.then((s) => s.trim())
		.catch(() => {
			throw new Error(
				`cannot resolve ${ref} — create the release tag first, or pass a commit`,
			);
		});
	process.stdout.write(recipe(commit));
	process.exit(0);
}

const sha =
	process.env.FORGEJO_SHA ??
	(await $`git rev-parse HEAD`.text().then((s) => s.trim()))!;
console.log(
	`>>> commit=${sha} versionName=${versionName} versionCode=${versionCode}`,
);

const fdd = await mkdtemp(path.join(tmpdir(), "fdroid-"));
await Bun.write(
	path.join(fdd, "metadata", `${APPID}.yml`),
	withoutReferenceBinary(recipe(sha)),
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
