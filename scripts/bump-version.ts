#!/usr/bin/env bun
import path from "path";
import { parseVersion, type Version } from "./lib/semver";

const root = path.join(import.meta.dir, "..");
const usage = "usage: bun scripts/bump-version.ts <version> [--code <n>]";

const DEV_SUFFIX = /[.-]?dev$/;
const PRE_MVP_VERSION = "0.1.0";
const handAssignedPreMvpCodes: Record<string, (index: number) => number> = {
	alpha: (index) => 999 + index,
	beta: (index) => 1000 + 10 * index,
};

type Occurrence = { file: string; literal: string };

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

function versionCodeFor({
	major,
	minor,
	patch,
	prerelease,
}: Version): number | null {
	const [tag, index] = prerelease.replace(DEV_SUFFIX, "").split(".");
	if (`${major}.${minor}.${patch}` === PRE_MVP_VERSION) {
		return handAssignedPreMvpCodes[tag ?? ""]?.(Number(index)) ?? null;
	}
	return major * 1_000_000 + minor * 1_000 + patch;
}

function versionOccurrences({
	version,
	code,
}: {
	version: string;
	code: number;
}): Occurrence[] {
	return [
		{ file: "package.json", literal: `"version": "${version}"` },
		{ file: "src-tauri/Cargo.toml", literal: `\nversion = "${version}"\n` },
		{
			file: "src-tauri/tauri.conf.json",
			literal: `"version": "${version}"`,
		},
		{
			file: "src-tauri/tauri.conf.json",
			literal: `"versionCode": ${code}`,
		},
		{
			file: "src-tauri/Cargo.lock",
			literal: `name = "open-grind"\nversion = "${version}"`,
		},
	];
}

function lastReleaseOccurrences({
	version,
}: {
	version: string;
}): Occurrence[] {
	return [
		{ file: "ci/aur/PKGBUILD", literal: `_ver=${version}` },
		{
			file: ".forgejo/issue_template/bug.yaml",
			literal: `placeholder: e.g. v${version}`,
		},
	];
}

const version = process.argv[2];
if (!version || version.startsWith("-")) fail(usage);
const parsed = parseVersion(version);
if (!parsed) fail(`${version} is not a valid semver version`);

const codeFlag = process.argv.indexOf("--code");
const code =
	codeFlag === -1
		? versionCodeFor(parsed)
		: Number(process.argv[codeFlag + 1]);
if (code === null || !Number.isInteger(code) || code <= 0) {
	fail(`${usage}\n${version} needs an explicit positive --code`);
}

const conf: { version: string; bundle: { android: { versionCode: number } } } =
	await Bun.file(path.join(root, "src-tauri/tauri.conf.json")).json();
const current = conf.version;
const currentCode = conf.bundle.android.versionCode;

if (version === current && code === currentCode) {
	console.log(`already at ${current} (versionCode ${currentCode})`);
	process.exit(0);
}
if (code < currentCode) {
	fail(`versionCode ${code} is below ${currentCode}; codes must not go back`);
}

const pendingWrites = new Map<string, string>();

const readStaged = async (file: string) =>
	pendingWrites.get(file) ?? (await Bun.file(path.join(root, file)).text());

async function stageSoleReplacement(from: Occurrence, to: string) {
	const text = await readStaged(from.file);
	const parts = text.split(from.literal);
	if (parts.length !== 2) {
		fail(
			`${from.file} holds ${parts.length - 1} copies of ${JSON.stringify(from.literal)}, expected 1; fix the drift first`,
		);
	}
	if (parts.join(to) !== text) pendingWrites.set(from.file, parts.join(to));
}

async function stageRename({
	from,
	to,
}: {
	from: Occurrence[];
	to: Occurrence[];
}) {
	for (const [index, occurrence] of from.entries()) {
		await stageSoleReplacement(occurrence, to[index]!.literal);
	}
}

await stageRename({
	from: versionOccurrences({ version: current, code: currentCode }),
	to: versionOccurrences({ version, code }),
});

const cuttingARelease = !DEV_SUFFIX.test(version);
if (cuttingARelease) {
	const lastReleased = (await readStaged("ci/aur/PKGBUILD"))
		.split("\n")
		.find((line) => line.startsWith("_ver="))
		?.slice("_ver=".length);
	if (!lastReleased) fail("ci/aur/PKGBUILD has no _ver= line");

	await stageRename({
		from: lastReleaseOccurrences({ version: lastReleased }),
		to: lastReleaseOccurrences({ version }),
	});

	const pacmanPkgver = (v: string) => v.replace("-", "");
	const srcinfo = await readStaged("ci/aur/.SRCINFO");
	const renamedSrcinfo = srcinfo
		.split(lastReleased)
		.join(version)
		.split(pacmanPkgver(lastReleased))
		.join(pacmanPkgver(version));
	if (renamedSrcinfo === srcinfo) {
		fail("ci/aur/.SRCINFO carries no version to move");
	}
	pendingWrites.set("ci/aur/.SRCINFO", renamedSrcinfo);
}

for (const [file, text] of pendingWrites) {
	await Bun.write(path.join(root, file), text);
}

console.log(`${current} (${currentCode}) -> ${version} (${code})`);
for (const file of pendingWrites.keys()) console.log(`  updated ${file}`);

const changelog = `fastlane/metadata/android/en-US/changelogs/${code}.txt`;
const stillToDo: string[] = [];
if (!(await Bun.file(path.join(root, changelog)).exists())) {
	stillToDo.push(`write ${changelog}`);
}
if (cuttingARelease) {
	stillToDo.push(
		"on Arch: cd ci/aur && updpkgsums && makepkg --printsrcinfo > .SRCINFO",
	);
} else {
	stillToDo.push("ci/aur and the issue template stay on the last release");
}
console.log("\nstill to do:");
for (const step of stillToDo) console.log(`  - ${step}`);
