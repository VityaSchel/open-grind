import { $ } from "bun";

import { verifyIpa } from "./ios/ipa";
import { XCRUN } from "./lib/xcrun";

const root = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(
	/\/$/,
	"",
);
const usage = "usage: bun run package:ios -- --testflight [--upload]";
const IPA = `${root}/src-tauri/gen/apple/build/arm64/Open Grind.ipa`;
const EXPORT_OPTIONS = `${root}/src-tauri/gen/apple/ExportOptions.plist`;
const BUILD_ENVIRONMENT_LEAKS = [
	"DEVELOPER_DIR",
	"SDKROOT",
	"OPEN_GRIND_DEMO",
	"CARGO_ENCODED_RUSTFLAGS",
	"PUBLIC_TEST_INSETS",
];

type AppStoreConnectKey = { id: string; issuer: string; path: string };

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

async function appStoreConnectKey(): Promise<AppStoreConnectKey> {
	const id = Bun.env.APP_STORE_CONNECT_KEY_ID;
	const issuer = Bun.env.APP_STORE_CONNECT_ISSUER;
	if (!id || !issuer) {
		fail(
			"set APP_STORE_CONNECT_KEY_ID and APP_STORE_CONNECT_ISSUER to an App Store Connect team API key with the Admin role, which Xcode needs to create the distribution certificate and profile",
		);
	}
	const path = `${Bun.env.HOME}/.appstoreconnect/private_keys/AuthKey_${id}.p8`;
	if (!(await Bun.file(path).exists())) fail(`${path} is missing`);
	return { id, issuer, path };
}

function buildEnvironment(key: AppStoreConnectKey): Record<string, string> {
	const inherited = Object.entries(Bun.env).filter(
		(entry): entry is [string, string] =>
			entry[1] !== undefined &&
			!BUILD_ENVIRONMENT_LEAKS.includes(entry[0]),
	);
	return {
		...Object.fromEntries(inherited),
		APPLE_API_KEY: key.id,
		APPLE_API_ISSUER: key.issuer,
		APPLE_API_KEY_PATH: key.path,
	};
}

if (!Bun.argv.includes("--testflight")) fail(usage);

const key = await appStoreConnectKey();
const { bundle } = await Bun.file(
	`${root}/src-tauri/tauri.ios.conf.json`,
).json();
const bundleVersion: string = bundle.iOS.bundleVersion;

const exportOptions = Bun.file(EXPORT_OPTIONS);
const committedExportOptions = await exportOptions.text();
await $`rm -f ${IPA}`;
try {
	await $`bun tauri ios build --export-method app-store-connect --ci`
		.cwd(root)
		.env(buildEnvironment(key));
} finally {
	await Bun.write(exportOptions, committedExportOptions);
}
await verifyIpa({ ipa: IPA, bundleVersion });
console.log(`built ${IPA} (CFBundleVersion ${bundleVersion})`);

const uploadCommand = [
	...XCRUN,
	"altool",
	"--upload-app",
	"--type",
	"ios",
	"--file",
	IPA,
	"--apiKey",
	key.id,
	"--apiIssuer",
	key.issuer,
];
if (Bun.argv.includes("--upload")) {
	await $`${uploadCommand}`;
	console.log("uploaded; TestFlight lists the build once processing ends");
} else {
	console.log(`upload with --upload, or run:\n${uploadCommand.join(" ")}`);
}
