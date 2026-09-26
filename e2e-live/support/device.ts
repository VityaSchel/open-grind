import { type Browser, chromium, type Page } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

const sdk =
	process.env.ANDROID_HOME ?? join(homedir(), "Library", "Android", "sdk");

export const liveDevice = {
	avd: "og-e2e-live",
	port: 5590,
	serial: "emulator-5590",
	systemImage: "system-images/android-35/default/arm64-v8a/",
	platform: "android-35",
	appPackage: "org.opengrind",
	appActivity: "org.opengrind/.MainActivity",
	devtoolsPort: 9590,
	appOrigin: "http://tauri.localhost",
} as const;

const adbPath = join(sdk, "platform-tools", "adb");
const emulatorPath = join(sdk, "emulator", "emulator");
const avdHome = join(homedir(), ".android", "avd");
const webViewFlags =
	"_ --disable-gpu-rasterization --disable-oop-rasterization";

export function adb(args: string[]) {
	return execFileSync(adbPath, ["-s", liveDevice.serial, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function adbOrNull(args: string[]) {
	try {
		return adb(args);
	} catch {
		return null;
	}
}

export async function waitFor<T>({
	what,
	timeoutMs,
	probe,
}: {
	what: string;
	timeoutMs: number;
	probe: () => T | null | Promise<T | null>;
}): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = await probe();
		if (value !== null) return value;
		await sleep(1000);
	}
	throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
}

export function ensureAvd() {
	const avdDir = join(avdHome, `${liveDevice.avd}.avd`);
	if (existsSync(avdDir)) return;
	mkdirSync(avdDir, { recursive: true });
	writeFileSync(
		join(avdHome, `${liveDevice.avd}.ini`),
		[
			"avd.ini.encoding=UTF-8",
			`path=${avdDir}`,
			`path.rel=avd/${liveDevice.avd}.avd`,
			`target=${liveDevice.platform}`,
			"",
		].join("\n"),
	);
	writeFileSync(
		join(avdDir, "config.ini"),
		[
			"avd.ini.encoding = UTF-8",
			`AvdId = ${liveDevice.avd}`,
			`avd.ini.displayname = ${liveDevice.avd}`,
			"PlayStore.enabled = no",
			"abi.type = arm64-v8a",
			"hw.cpu.arch = arm64",
			"hw.cpu.ncore = 2",
			"hw.ramSize = 2048",
			"vm.heapSize = 228M",
			"disk.dataPartition.size = 6442450944",
			"hw.lcd.density = 420",
			"hw.lcd.width = 1080",
			"hw.lcd.height = 2400",
			"hw.keyboard = no",
			"hw.mainKeys = no",
			"hw.gpu.enabled = yes",
			"hw.gpu.mode = swiftshader_indirect",
			"hw.initialOrientation = portrait",
			"hw.sdCard = no",
			`image.sysdir.1 = ${liveDevice.systemImage}`,
			"tag.display = Default Android System Image",
			"tag.id = default",
			"fastboot.forceColdBoot = no",
			"fastboot.forceFastBoot = yes",
			"",
		].join("\n"),
	);
}

function isBooted() {
	return adbOrNull(["shell", "getprop", "sys.boot_completed"]) === "1";
}

export async function ensureEmulator({ logFile }: { logFile: string }) {
	if (isBooted()) return;
	ensureAvd();
	mkdirSync(dirname(logFile), { recursive: true });
	const log = openSync(logFile, "a");
	spawn(
		emulatorPath,
		[
			"-avd",
			liveDevice.avd,
			"-port",
			String(liveDevice.port),
			"-memory",
			"2048",
			"-cores",
			"2",
			"-gpu",
			"swiftshader_indirect",
			"-no-window",
			"-no-audio",
			"-no-boot-anim",
			"-no-snapshot-save",
			"-prop",
			"ro.hw_timeout_multiplier=10",
		],
		{ detached: true, stdio: ["ignore", log, log] },
	).unref();
	await waitFor({
		what: `${liveDevice.serial} to boot`,
		timeoutMs: 900_000,
		probe: () => (isBooted() ? true : null),
	});
}

export function prepareDevice() {
	adb([
		"shell",
		`echo '${webViewFlags}' > /data/local/tmp/webview-command-line`,
	]);
	adb(["shell", "svc", "power", "stayon", "true"]);
	adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
	adb(["shell", "input", "keyevent", "KEYCODE_MENU"]);
	adb(["shell", "wm", "dismiss-keyguard"]);
}

export const debugApk = join(
	import.meta.dirname,
	"..",
	"..",
	"src-tauri",
	"gen",
	"android",
	"app",
	"build",
	"outputs",
	"apk",
	"universal",
	"debug",
	"app-universal-debug.apk",
);

export class DeviceError extends Error {
	override name = "DeviceError";
}

export function ensureAppInstalled() {
	if (adbOrNull(["shell", "pm", "path", liveDevice.appPackage])) return;
	if (!existsSync(debugApk)) {
		throw new DeviceError(
			"No debug APK; run `bun tauri android build --debug --apk --target aarch64`",
		);
	}
	adb(["install", "-r", debugApk]);
}

export function stopApp() {
	adb(["shell", "am", "force-stop", liveDevice.appPackage]);
}

export async function launchApp() {
	adb(["shell", "am", "start", "-W", "-n", liveDevice.appActivity]);
	return await waitFor({
		what: `${liveDevice.appPackage} to start`,
		timeoutMs: 30_000,
		probe: () => adbOrNull(["shell", "pidof", liveDevice.appPackage]),
	});
}

function devtoolsSocketOf(pid: string) {
	const sockets = adbOrNull(["shell", "cat", "/proc/net/unix"]) ?? "";
	const name = `webview_devtools_remote_${pid}`;
	return sockets.includes(`@${name}`) ? name : null;
}

async function appPage(browser: Browser) {
	return await waitFor({
		what: "the app page",
		timeoutMs: 30_000,
		probe: () =>
			browser
				.contexts()
				.flatMap((context) => context.pages())
				.find((page) => page.url().startsWith(liveDevice.appOrigin)) ??
			null,
	});
}

export type AttachedApp = { browser: Browser; page: Page };

export async function attachApp(): Promise<AttachedApp> {
	const pid = await waitFor({
		what: `${liveDevice.appPackage} to run`,
		timeoutMs: 30_000,
		probe: () => adbOrNull(["shell", "pidof", liveDevice.appPackage]),
	});
	const socket = await waitFor({
		what: "the WebView devtools socket",
		timeoutMs: 30_000,
		probe: () => devtoolsSocketOf(pid),
	});
	adb([
		"forward",
		`tcp:${liveDevice.devtoolsPort}`,
		`localabstract:${socket}`,
	]);
	const browser = await chromium.connectOverCDP(
		`http://127.0.0.1:${liveDevice.devtoolsPort}`,
		{ noDefaults: true },
	);
	return { browser, page: await appPage(browser) };
}

export async function relaunchApp(): Promise<AttachedApp> {
	stopApp();
	await launchApp();
	return await attachApp();
}
