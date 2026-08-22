#!/usr/bin/env bun

import { $, Glob } from "bun";
import { existsSync } from "node:fs";

import * as C from "./config.ts";

const first = (pattern: string, cwd: string) => {
	for (const m of new Glob(pattern).scanSync({ cwd, absolute: true }))
		return m;
	return "";
};

export async function install() {
	const workdir = `${C.OUT_DIR}/apk`;
	await $`rm -rf ${workdir}`.quiet();
	await $`mkdir -p ${workdir}`.quiet();

	let src = process.env.APK_PATH ?? "";
	if (src) {
		if (!existsSync(src)) C.die(`APK_PATH not found: ${src}`);
		C.log(`using local artifact: ${src}`);
	} else {
		if (!Bun.which("apkeep"))
			C.die("apkeep not installed and APK_PATH unset");
		C.log(`downloading latest ${C.PKG} via apkeep`);
		await $`apkeep -a ${C.PKG} -d apk-pure ${workdir}`.nothrow();
		src =
			first("**/*.{xapk,apk,apkm}", workdir) ||
			C.die(
				"apkeep produced no artifact. Pass a complete file instead, e.g. APK_PATH=../reverse/grindr-26.9.2.xapk bun run install-apk",
			);
	}

	if (src.endsWith(".apk")) {
		await C.adb("install", "-r", "-g", src);
	} else {
		// bsdtar reads zip/xapk/apkm streaming
		if ((await $`tar -tf ${src}`.nothrow().quiet()).exitCode !== 0)
			C.die(
				`archive is unreadable — a truncated or corrupt download? ${src}`,
			);
		const extracted = `${workdir}/extracted`;
		await $`mkdir -p ${extracted}`.quiet();
		const ex = await $`tar -xf ${src} -C ${extracted}`.nothrow();
		const apks = [
			...new Glob("**/*.apk").scanSync({
				cwd: extracted,
				absolute: true,
			}),
		];
		if (ex.exitCode !== 0 || !apks.length)
			C.die(`extraction failed (truncated download?): ${src}`);
		C.log(`adb install-multiple (${apks.length} splits)`);
		await C.adb("install-multiple", "-r", "-g", ...apks);
	}

	const dump = await C.adb("shell", "dumpsys", "package", C.PKG).text();
	C.log(`installed ${C.PKG} ${dump.match(/versionName=(\S+)/)?.[1] ?? "?"}`);
}

if (import.meta.main) await install();
