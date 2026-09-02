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

const recipe = ({
	commit,
	conf,
}: {
	commit: string;
	conf: TauriConf;
}): string =>
	recipeTemplate
		.replaceAll("${versionName}", conf.version)
		.replaceAll(
			"${versionCode}",
			conf.bundle.android.versionCode.toString(),
		)
		.replaceAll("${commit}", commit);

const withoutReferenceBinary = (rendered: string): string =>
	rendered.replace(/^Binaries:.*\n/m, "");

if (process.argv[2] === "emit") {
	const ref = process.argv[3];
	if (!ref) throw new Error("usage: fdroid.ts emit <tag|commit>");
	const commit = await resolveCommit(ref);
	process.stdout.write(recipe({ commit, conf: await readConf(commit) }));
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
	withoutReferenceBinary(recipe({ commit: sha, conf })),
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
