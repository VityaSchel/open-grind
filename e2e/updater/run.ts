import { $ } from "bun";

// Desktop: bun run.ts demo
// Mobile using nix (adb, jdk, ndk): nix develop ../.. --command bun run.ts android
// Pass `--rebuild` to force new fixtures
// Pass `--keep-data` to leave the app's data in place instead of clearing it
// - `FAIL=drop|server|signature|oversize|unsigned` to inject a failure
// - `RATE` to throttle
// - `PORT` to specify port
// App requests are logged to `.state/requests.jsonl`, useful for testing `FAIL=server`
// If you get errors from cmake about generator or `boring-sys2`, clear `src-tauri/target/*/*/build/boring-sys2-*/out/build`

import { android, androidFixtures } from "./commands/android";
import { demo } from "./commands/demo";
import { clearLaunchEnv, quit, resetAppData, runningPids } from "./lib/app";
import {
	failMode,
	port,
	rate,
	requestLog,
	serverHome,
	state,
} from "./lib/config";
import {
	clearAppData,
	clearOverride,
	requireDevice,
	stopApp,
	unbridge,
} from "./lib/device";

const force = Bun.argv.includes("--rebuild");
const keepData = Bun.argv.includes("--keep-data");
const command = Bun.argv[2]?.startsWith("--")
	? "demo"
	: (Bun.argv[2] ?? "demo");

export const harnessOptions = {
	home: serverHome,
	port,
	rate,
	failMode,
	journal: requestLog,
};

async function preflight(): Promise<void> {
	if (!Bun.which("minisign")) {
		throw new Error("minisign not found — run this inside 'nix develop'");
	}
	if ((await runningPids()).length) {
		throw new Error("the demo app is already running — quit it first");
	}
}

async function cleanDevice(): Promise<boolean> {
	try {
		await requireDevice();
	} catch {
		return false;
	}
	await stopApp();
	await clearAppData();
	await clearOverride();
	await unbridge();
	return true;
}

async function clean(): Promise<void> {
	await quit();
	await clearLaunchEnv();
	await resetAppData();
	const device = await cleanDevice();
	await $`rm -rf ${state}`;
	console.log(
		`removed demo app data, fixtures and environment overrides${
			device ? ", and cleared the app on the device" : ""
		}`,
	);
}

switch (command) {
	case "demo":
		await preflight();
		await demo({ force });
		break;
	case "android":
		await android({ force, keepData });
		break;
	case "android-build":
		await androidFixtures({ force });
		break;
	case "clean":
		await clean();
		break;
	default:
		throw new Error(
			`unknown command ${command}; expected demo, android, android-build or clean`,
		);
}
