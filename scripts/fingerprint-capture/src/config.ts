import { $, Glob } from "bun";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const env = process.env;
const HOME = homedir();

export const ANDROID_HOME =
	env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT ?? `${HOME}/Library/Android/sdk`;
// Export so child tools (sdkmanager/avdmanager/emulator) can find the SDK root
// even when cmdline-tools aren't in the canonical latest/ location.
env.ANDROID_HOME = ANDROID_HOME;
env.ANDROID_SDK_ROOT = ANDROID_HOME;
export const EMULATOR = `${ANDROID_HOME}/emulator/emulator`;
export const ADB = `${ANDROID_HOME}/platform-tools/adb`;

const findTool = (name: string): string => {
	const direct = [
		`cmdline-tools/latest/bin/${name}`,
		`cmdline-tools/bin/${name}`,
		`tools/bin/${name}`,
	];
	for (const rel of direct)
		if (existsSync(`${ANDROID_HOME}/${rel}`))
			return `${ANDROID_HOME}/${rel}`;
	for (const m of new Glob(`cmdline-tools/*/bin/${name}`).scanSync({
		cwd: ANDROID_HOME,
		absolute: true,
	}))
		return m;
	return "";
};
export const AVDMANAGER = findTool("avdmanager");
export const SDKMANAGER = findTool("sdkmanager");

export const SYS_ABI =
	env.SYS_ABI ?? (process.arch === "arm64" ? "arm64-v8a" : "x86_64");
export const API_LEVEL = env.API_LEVEL ?? "35";
export const SYS_IMG =
	env.SYS_IMG ??
	`system-images;android-${API_LEVEL};google_apis_playstore;${SYS_ABI}`;
export const AVD_NAME = env.AVD_NAME ?? "grindr-fp";
export const EMU_PORT = env.EMU_PORT ?? "5560";
export const SERIAL = `emulator-${EMU_PORT}`;
export const SNAPSHOT = env.SNAPSHOT ?? "signed-in";
export const PKG = env.PKG ?? "com.grindrapp.android";
export const HEADLESS = (env.HEADLESS ?? "1") === "1";
export const EMU_GPU =
	env.EMU_GPU ??
	(process.platform === "darwin" ? "host" : "swiftshader_indirect");
export const ROOT = `${import.meta.dir}/..`;
export const OUT_DIR = env.OUT_DIR ?? `${ROOT}/out`;

export const CAP_IFACE = env.CAP_IFACE ?? "en0";
export const GEO_LON = env.GEO_LON ?? "-73.9857";
export const GEO_LAT = env.GEO_LAT ?? "40.7484";

export async function qemuPids(): Promise<string[]> {
	const out = await $`pgrep -f ${`qemu.*${AVD_NAME}`}`.nothrow().text();
	const pids = out.trim().split("\n").filter(Boolean);
	return pids.length
		? pids
		: (await $`pgrep -f ${AVD_NAME}`.nothrow().text())
				.trim()
				.split("\n")
				.filter(Boolean);
}

export async function emulatorRemoteIps(pids: string[]): Promise<Set<string>> {
	const ips = new Set<string>();
	for (const pid of pids) {
		const out = await $`lsof -nP -iTCP -a -p ${pid}`.nothrow().text();
		for (const m of out.matchAll(/->(\d+\.\d+\.\d+\.\d+):\d+/g))
			ips.add(m[1]);
	}
	return ips;
}

export const log = (m: string) => console.error(`\x1b[1;36m[fp]\x1b[0m ${m}`);
export const die = (m: string): never => {
	console.error(`\x1b[1;31m[fp] ${m}\x1b[0m`);
	process.exit(1);
};

export const adb = (...args: string[]) =>
	$`${ADB} -s ${SERIAL} ${args}`.quiet();

const tailLog = async (n = 25) =>
	(
		await Bun.file(`${OUT_DIR}/emulator.log`)
			.text()
			.catch(() => "")
	)
		.split("\n")
		.slice(-n)
		.join("\n");

export async function waitBoot() {
	log(`waiting for ${SERIAL} to boot…`);
	const start = Date.now();
	const pid = Number(
		await Bun.file(`${OUT_DIR}/emulator.pid`)
			.text()
			.catch(() => "0"),
	);
	while (Date.now() - start < 300_000) {
		if (pid)
			try {
				process.kill(pid, 0);
			} catch {
				die(`emulator exited early:\n${await tailLog()}`);
			}
		if (
			(
				await adb("shell", "getprop", "sys.boot_completed")
					.nothrow()
					.text()
			).trim() === "1"
		) {
			log(`booted after ~${Math.round((Date.now() - start) / 1000)}s`);
			return;
		}
		await Bun.sleep(3000);
	}
	die(`boot timed out after 300s. Last emulator.log:\n${await tailLog()}`);
}
