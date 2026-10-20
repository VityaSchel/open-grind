#!/usr/bin/env bun
import { lstat, symlink } from "node:fs/promises";
import path from "path";
import { parseVersion, type Version } from "./lib/semver";

const root = path.join(import.meta.dir, "..");
const usage = "usage: bun scripts/bump-version.ts <version> [--code <n>]";

const DEV_SUFFIX = /[.-]?dev$/;
const PRE_MVP_VERSION = "0.1.0";
const handAssignedPreMvpCodes: Record<string, (index: number) => number> = {
	rc: (index) => 10_000 + 1000 * index,
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
	const release = major * 10_000_000 + minor * 100_000 + patch * 1000;
	if (!tag) return release;
	if (`${major}.${minor}.${patch}` === PRE_MVP_VERSION) {
		return handAssignedPreMvpCodes[tag]?.(Number(index)) ?? null;
	}
	const candidate = Number(index);
	if (tag !== "rc" || !Number.isInteger(candidate)) return null;
	if (candidate < 1 || candidate > 99) return null;
	return release - 1000 + 10 * candidate;
}

async function linkAbiChangelogs(code: number): Promise<string[]> {
	const offsets = (
		await Bun.file(
			path.join(root, "src-tauri/gen/android/gradle.properties"),
		).text()
	).match(/^opengrind\.android\.abiVersionCodeOffsets=(.+)$/m)?.[1];
	if (!offsets) {
		fail(
			"gradle.properties has no opengrind.android.abiVersionCodeOffsets",
		);
	}
	const linked: string[] = [];
	const changelogs = new Bun.Glob(
		`fastlane/metadata/android/*/changelogs/${code}.txt`,
	).scan(root);
	for await (const changelog of changelogs) {
		for (const entry of offsets.split(",")) {
			const offset = Number(entry.split(":")[1]);
			const link = path.join(
				path.dirname(changelog),
				`${code + offset}.txt`,
			);
			if (await lstat(path.join(root, link)).catch(() => null)) continue;
			await symlink(`${code}.txt`, path.join(root, link));
			linked.push(link);
		}
	}
	return linked;
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
		{ file: "ci/homebrew/open-grind.rb", literal: `version "${version}"` },
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
if (code % 10 !== 0) {
	fail(
		`versionCode ${code} must end in 0; the last digit is the per-ABI offset from opengrind.android.abiVersionCodeOffsets`,
	);
}

const conf: { version: string; bundle: { android: { versionCode: number } } } =
	await Bun.file(path.join(root, "src-tauri/tauri.conf.json")).json();
const current = conf.version;
const currentCode = conf.bundle.android.versionCode;

if (code < currentCode) {
	fail(`versionCode ${code} is below ${currentCode}; codes must not go back`);
}

const linkedChangelogs = await linkAbiChangelogs(code);

if (version === current && code === currentCode) {
	console.log(`already at ${current} (versionCode ${currentCode})`);
	for (const link of linkedChangelogs) console.log(`  linked ${link}`);
	process.exit(0);
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
for (const link of linkedChangelogs) console.log(`  linked ${link}`);

const changelog = `fastlane/metadata/android/en-US/changelogs/${code}.txt`;
const stillToDo: string[] = [];
if (!(await Bun.file(path.join(root, changelog)).exists())) {
	stillToDo.push(
		`write ${changelog}, then rerun this bump to link its per-ABI copies`,
	);
}
if (cuttingARelease) {
	stillToDo.push(
		"on Arch: cd ci/aur && updpkgsums && makepkg --printsrcinfo > .SRCINFO",
		`put the sha256 of open-grind-v${version}-macos.zip into ci/homebrew/open-grind.rb`,
	);
} else {
	stillToDo.push(
		"ci/aur, ci/homebrew and the issue template stay on the last release",
	);
}
console.log("\nstill to do:");
for (const step of stillToDo) console.log(`  - ${step}`);
