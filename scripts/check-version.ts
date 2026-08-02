import { readFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dir, "..");

const fail = (message: string): never => {
	console.error(`\x1b[31merror\x1b[0m: ${message}`);
	process.exit(1);
};

const cargo = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");
const cargoVersion = /^version = "(.+)"$/m.exec(cargo)?.[1];
if (!cargoVersion) fail("no version found in src-tauri/Cargo.toml");

const config: {
	version?: string;
	bundle?: { android?: { versionCode?: number } };
} = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const configVersion = config.version;
if (!configVersion) fail("no version found in src-tauri/tauri.conf.json");

const packageVersion: string | undefined = JSON.parse(
	readFileSync(join(root, "package.json"), "utf8"),
).version;
if (!packageVersion) fail("no version found in package.json");

if (cargoVersion !== configVersion || packageVersion !== configVersion) {
	fail(
		`version mismatch: tauri.conf.json is ${configVersion}, Cargo.toml is ${cargoVersion}, ` +
			`package.json is ${packageVersion}. Tauri reads the version from tauri.conf.json, so ` +
			`drift here silently changes the user agent and the update check.`,
	);
}

const semver =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const parsed = semver.exec(configVersion!);
if (!parsed) fail(`${configVersion} is not a valid semver version`);
const prerelease = parsed![4] ?? "";

const versionCode = config.bundle?.android?.versionCode;
if (!Number.isInteger(versionCode)) {
	fail("bundle.android.versionCode must be an integer");
}

const isDev =
	prerelease.split(".").includes("dev") || prerelease.endsWith("-dev");

if (!isDev) {
	fail(
		`${configVersion} has no -dev prerelease. After tagging a release, bump straight to the ` +
			`next version with -dev (e.g. 0.1.0-beta.5-dev) so main never claims to be a published ` +
			`release. Release builds set the release version and run with allow_dev off.`,
	);
}

console.log(`version ${configVersion} (versionCode ${versionCode}) ok`);
