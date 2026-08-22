#!/usr/bin/env bun
// create | boot [--fresh] | snapshot <name> | kill

import { $ } from "bun";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

import * as C from "./config.ts";

// avdmanager mis-writes image.sysdir.1 when cmdline-tools aren't in latest/
// (it computes the SDK root one level too high). Rewrite it from SYS_IMG.
function fixAvdConfig() {
	const cfg = `${homedir()}/.android/avd/${C.AVD_NAME}.avd/config.ini`;
	if (!existsSync(cfg)) return;
	const sysdir = `system-images/${C.SYS_IMG.split(";").slice(1).join("/")}/`;
	let text = readFileSync(cfg, "utf8");
	const set = (k: string, v: string) => {
		const re = new RegExp(`^${k.replace(/\./g, "\\.")}=.*$`, "m");
		text = re.test(text)
			? text.replace(re, `${k}=${v}`)
			: `${text}\n${k}=${v}`;
	};
	set("image.sysdir.1", sysdir);
	set("hw.gpu.enabled", "yes");
	writeFileSync(cfg, text);
	C.log(`patched image.sysdir.1=${sysdir}`);
}

const emuArgs = () => [
	"-avd",
	C.AVD_NAME,
	"-port",
	C.EMU_PORT,
	"-gpu",
	C.EMU_GPU,
	"-no-boot-anim",
	"-no-audio",
	"-accel",
	"auto",
	...(C.HEADLESS ? ["-no-window"] : []),
];

async function spawnEmu(extra: string[]) {
	await Bun.write(`${C.OUT_DIR}/.keep`, "");
	const fd = openSync(`${C.OUT_DIR}/emulator.log`, "w");
	const proc = Bun.spawn([C.EMULATOR, ...emuArgs(), ...extra], {
		stdout: fd,
		stderr: fd,
		stdin: "ignore",
	});
	await Bun.write(`${C.OUT_DIR}/emulator.pid`, String(proc.pid));
	proc.unref();
	await C.waitBoot();
}

export async function create() {
	if (!C.SDKMANAGER) C.die("sdkmanager not found under cmdline-tools");
	C.log(`ensuring image ${C.SYS_IMG}`);
	await $`yes | ${C.SDKMANAGER} --sdk_root=${C.ANDROID_HOME} --install ${C.SYS_IMG}`.quiet();
	const list = await $`${C.AVDMANAGER} list avd`.nothrow().text();
	if (list.includes(`Name: ${C.AVD_NAME}`)) C.log(`AVD ${C.AVD_NAME} exists`);
	else {
		C.log(`creating AVD ${C.AVD_NAME}`);
		await $`echo no | ${C.AVDMANAGER} create avd -n ${C.AVD_NAME} -k ${C.SYS_IMG} --device pixel_7 --force`;
	}
	fixAvdConfig();
	C.log(
		`created. Next: one-time sign-in, then 'bun run avd snapshot ${C.SNAPSHOT}'`,
	);
}

export const boot = (fresh: boolean) =>
	spawnEmu(
		fresh
			? ["-no-snapshot-load"]
			: ["-snapshot", C.SNAPSHOT, "-no-snapshot-save"],
	);

export async function snapshot(name: string) {
	C.log(`saving snapshot '${name}' (leave the emulator running)`);
	await C.adb("emu", "avd", "snapshot", "save", name);
	C.log(`saved. verify: ${C.EMULATOR} -avd ${C.AVD_NAME} -snapshot-list`);
}

export async function kill() {
	await C.adb("emu", "kill").nothrow();
	const pid = await Bun.file(`${C.OUT_DIR}/emulator.pid`)
		.text()
		.catch(() => "");
	if (pid) {
		try {
			process.kill(Number(pid));
		} catch {
			//
		}
	}
}

if (import.meta.main) {
	const [cmd, arg] = process.argv.slice(2);
	if (cmd === "create") await create();
	else if (cmd === "boot") await boot(arg === "--fresh");
	else if (cmd === "snapshot") await snapshot(arg ?? C.die("need <name>"));
	else if (cmd === "kill") await kill();
	else C.die("usage: avd {create|boot [--fresh]|snapshot <name>|kill}");
}
