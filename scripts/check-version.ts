import path from "path";
import tauriConfJson from "../src-tauri/tauri.conf.json";
import packageJson from "../package.json";

const cargo = await Bun.file(
	path.join(__dirname, "../src-tauri/Cargo.toml"),
).text();
const cargoVersion = /^version = "(.+)"$/m.exec(cargo)?.[1];
if (!cargoVersion) throw new Error("no version found in src-tauri/Cargo.toml");

const configVersion = tauriConfJson.version;

const packageVersion = packageJson.version;
if (!packageVersion) throw new Error("no version found in package.json");

if (cargoVersion !== configVersion || packageVersion !== configVersion) {
	throw new Error(
		`version mismatch: tauri.conf.json is ${configVersion}, Cargo.toml is ${cargoVersion}, ` +
			`package.json is ${packageVersion}. Tauri reads the version from tauri.conf.json, so ` +
			`drift here silently changes the user agent and the update check.`,
	);
}

const semver =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const parsed = semver.exec(configVersion!);
if (!parsed) throw new Error(`${configVersion} is not a valid semver version`);
const prerelease = parsed![4] ?? "";

const versionCode = tauriConfJson.bundle?.android?.versionCode;
if (!Number.isInteger(versionCode)) {
	throw new Error("bundle.android.versionCode must be an integer");
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
