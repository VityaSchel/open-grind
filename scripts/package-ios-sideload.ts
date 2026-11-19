import { existsSync, realpathSync } from "node:fs";

import { $ } from "bun";

import { IPA_APP, verifyIpa } from "./ios/ipa";
import { contentUuid, withUuid } from "./ios/mach-o-uuid";
import { plistXml } from "./ios/plist-xml";
import {
	IPHONEOS_SDK_BUILD,
	pathLeaks,
	sideloadInfoPlist,
	XCODE_BUILD,
} from "./ios/sideload";
import { removeSignature, signAdHoc } from "./lib/ad-hoc-sign";
import { assetSuffix } from "./lib/asset-suffix";
import { archive, sourceDateStamp } from "./lib/deterministic-zip";
import { XCRUN } from "./lib/xcrun";

const NIX_APP = "build-ios";
const APP_NAME = "Open Grind.app";
const EXECUTABLE = "Open Grind";
const UNSIGNED_ONLY = ["embedded.mobileprovision", "_CodeSignature"];
const NOT_EMBEDDED = ["Frameworks"];
const C_FLAG_VARIABLES = ["CFLAGS", "CXXFLAGS"];

const root = realpathSync(
	Bun.fileURLToPath(new URL("..", import.meta.url)),
).replace(/\/$/, "");
const stamp = sourceDateStamp(NIX_APP);
const archived = `${root}/src-tauri/gen/apple/build/open-grind_iOS.xcarchive`;
const payload = `${root}/src-tauri/gen/apple/build/sideload/Payload`;
const app = `${payload}/${APP_NAME}`;
const dsym = `${archived}/dSYMs/${APP_NAME}.dSYM/Contents/Resources/DWARF/${EXECUTABLE}`;
const out = `${root}/src-tauri/target/release/artifacts`;

const { version } = await Bun.file(`${root}/src-tauri/tauri.conf.json`).json();
const { bundle } = await Bun.file(
	`${root}/src-tauri/tauri.ios.conf.json`,
).json();
const bundleVersion: string = bundle.iOS.bundleVersion;
const ipa = `${out}/open-grind-v${version}${assetSuffix("ipa")}`;

async function requirePinnedXcode(): Promise<void> {
	const xcode = await $`${XCRUN} xcodebuild -version`.text();
	if (!xcode.split("\n").includes(`Build version ${XCODE_BUILD}`)) {
		throw new Error(
			`the IPA reproduces only with Xcode build ${XCODE_BUILD}, select it with xcode-select; the selected Xcode reports:\n${xcode}`,
		);
	}
	const sdk = (
		await $`${XCRUN} --sdk iphoneos --show-sdk-build-version`.text()
	).trim();
	if (sdk !== IPHONEOS_SDK_BUILD) {
		throw new Error(
			`the IPA reproduces only with iOS SDK build ${IPHONEOS_SDK_BUILD}, Xcode has ${sdk}`,
		);
	}
}

function cargoCFlags(): string[] {
	return C_FLAG_VARIABLES.flatMap((name) => {
		const flags = Bun.env[name]?.trim();
		if (!flags) {
			throw new Error(`${name} is unset, run \`nix run .#${NIX_APP}\``);
		}
		return ["--config", `env.${name}=${JSON.stringify(flags)}`];
	});
}

async function stageApp(): Promise<void> {
	await $`rm -rf ${payload}`;
	await $`mkdir -p ${payload}`;
	await $`ditto --norsrc --noextattr --noacl ${archived}/Products/Applications/${APP_NAME} ${app}`;
	for (const name of [...UNSIGNED_ONLY, ...NOT_EMBEDDED]) {
		if (existsSync(`${app}/${name}`)) {
			throw new Error(`${app} unexpectedly carries ${name}`);
		}
	}
}

async function normalizeInfoPlist(): Promise<void> {
	const path = `${app}/Info.plist`;
	const info = JSON.parse(await $`plutil -convert json -o - ${path}`.text());
	await Bun.write(path, plistXml(sideloadInfoPlist(info)));
}

async function requireNoBuildPaths(): Promise<void> {
	const strings = (
		await $`${XCRUN} strings -a ${`${app}/${EXECUTABLE}`}`.text()
	).split("\n");
	const machinePaths = [
		root,
		Bun.env.HOME,
		Bun.env.CARGO_HOME,
		"/Users/",
		"/var/folders/",
		"DerivedData",
	].filter((path): path is string => Boolean(path));
	const leaks = pathLeaks({ strings, paths: machinePaths });
	if (leaks.length > 0) {
		throw new Error(
			`${EXECUTABLE} embeds ${leaks.length} build machine paths, such as:\n${leaks.slice(0, 20).join("\n")}`,
		);
	}
}

async function useContentUuid(): Promise<void> {
	const binary = `${app}/${EXECUTABLE}`;
	await removeSignature(binary);
	const unsigned = await Bun.file(binary).bytes();
	const uuid = contentUuid(unsigned);
	await Bun.write(binary, withUuid({ binary: unsigned, uuid }));
	await Bun.write(
		dsym,
		withUuid({ binary: await Bun.file(dsym).bytes(), uuid }),
	);
}

async function verifySideload(): Promise<void> {
	await verifyIpa({ ipa, bundleVersion });
	const into = (await $`mktemp -d`.text()).trim();
	try {
		await $`unzip -q ${ipa} -d ${into}`;
		const unpacked = `${into}/${IPA_APP}`;
		await $`codesign --verify --deep --strict ${unpacked}`;
		const entitlements =
			await $`codesign -d --entitlements - --xml ${unpacked}`.quiet();
		if (entitlements.stdout.length > 0) {
			throw new Error(`${ipa} is signed with entitlements`);
		}
		const buildMachine =
			await $`plutil -extract BuildMachineOSBuild raw -o - ${`${unpacked}/Info.plist`}`
				.nothrow()
				.quiet();
		if (buildMachine.exitCode === 0) {
			throw new Error(`${ipa} names the macOS build that made it`);
		}
		for (const name of ["embedded.mobileprovision", ...NOT_EMBEDDED]) {
			if (existsSync(`${unpacked}/${name}`)) {
				throw new Error(`${ipa} carries ${name}`);
			}
		}
	} finally {
		await $`rm -rf ${into}`;
	}
}

await requirePinnedXcode();
await $`rm -rf ${archived}`;
await $`bun tauri ios build --no-sign --archive-only --ci -- ${cargoCFlags()}`.cwd(
	root,
);
await stageApp();
await normalizeInfoPlist();
await requireNoBuildPaths();
await useContentUuid();
await signAdHoc({
	bundle: app,
	executable: EXECUTABLE,
	hardenedRuntime: false,
});
await $`mkdir -p ${out}`;
await archive({ root: payload, zip: ipa, stamp });
await verifySideload();

const sha256 = new Bun.CryptoHasher("sha256")
	.update(await Bun.file(ipa).bytes())
	.digest("hex");
console.log(`
${ipa}
  sha256 ${sha256}
  signed ad-hoc, no entitlements (sideload only)`);
