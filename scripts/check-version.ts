import path from "path";
import tauriConfJson from "../src-tauri/tauri.conf.json";
import { requireVersion } from "./lib/semver";
import { versionOccurrences } from "./lib/version-occurrences";

const root = path.join(import.meta.dir, "..");
const configVersion = tauriConfJson.version;

const { prerelease } = requireVersion(configVersion);

const versionCode = tauriConfJson.bundle?.android?.versionCode;
if (!Number.isInteger(versionCode)) {
	throw new Error("bundle.android.versionCode must be an integer");
}
if (versionCode % 10 !== 0) {
	throw new Error(
		`bundle.android.versionCode ${versionCode} must end in 0; the last digit is the per-ABI offset from opengrind.android.abiVersionCodeOffsets`,
	);
}

for (const { file, literal } of versionOccurrences({
	version: configVersion,
	code: versionCode,
})) {
	const text = await Bun.file(path.join(root, file)).text();
	const copies = text.split(literal).length - 1;
	if (copies !== 1) {
		throw new Error(
			`${file} holds ${copies} copies of ${JSON.stringify(literal)}, expected 1: every version copy must match tauri.conf.json (${configVersion}, versionCode ${versionCode})`,
		);
	}
}

const isDev =
	prerelease.split(".").includes("dev") || prerelease.endsWith("-dev");

if (!isDev) {
	throw new Error(
		`${configVersion} has no -dev prerelease. After tagging a release, bump straight to the ` +
			`next version with -dev (e.g. 0.1.0-beta.5-dev) so main never claims to be a published ` +
			`release. Release builds set the release version and run with allow_dev off.`,
	);
}

console.log(`version ${configVersion} (versionCode ${versionCode}) ok`);
