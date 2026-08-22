#!/usr/bin/env bun

import * as C from "./config.ts";

const DWELL = Number(process.env.DWELL ?? 6);
const tap = (x: number, y: number) =>
	C.adb("shell", "input", "tap", `${x}`, `${y}`);
const swipeUp = () =>
	C.adb("shell", "input", "swipe", "540", "1600", "540", "500", "300");
const back = () => C.adb("shell", "input", "keyevent", "4");

export async function enableLocation() {
	C.log(`location on + GPS fix ${C.GEO_LAT},${C.GEO_LON}`);
	await C.adb(
		"shell",
		"cmd",
		"location",
		"set-location-enabled",
		"true",
	).nothrow();
	await C.adb(
		"shell",
		"settings",
		"put",
		"secure",
		"location_mode",
		"3",
	).nothrow();
	await C.adb(
		"shell",
		"pm",
		"grant",
		C.PKG,
		"android.permission.ACCESS_FINE_LOCATION",
	).nothrow();
	await C.adb(
		"shell",
		"pm",
		"grant",
		C.PKG,
		"android.permission.ACCESS_COARSE_LOCATION",
	).nothrow();
	await C.adb("emu", "geo", "fix", C.GEO_LON, C.GEO_LAT).nothrow();
}

async function tapMatch(re: RegExp): Promise<boolean> {
	const xml = await C.adb("exec-out", "uiautomator", "dump", "/dev/tty")
		.nothrow()
		.text();
	for (const node of xml.split("<node")) {
		if (
			!new RegExp(
				`(text|content-desc)="[^"]*(${re.source})[^"]*"`,
				"i",
			).test(node)
		)
			continue;
		const b = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
		if (!b) continue;
		await tap((+b[1] + +b[3]) / 2, (+b[2] + +b[4]) / 2);
		return true;
	}
	return false;
}

export async function drive() {
	await enableLocation();
	await C.adb("shell", "am", "force-stop", C.PKG).nothrow();
	await Bun.sleep(1500);

	C.log(`launching ${C.PKG}`);
	const resolved = await C.adb(
		"shell",
		"cmd",
		"package",
		"resolve-activity",
		"--brief",
		"-c",
		"android.intent.category.LAUNCHER",
		C.PKG,
	)
		.nothrow()
		.text();
	const comp = resolved.trim().split("\n").pop()?.trim() ?? "";
	// full MAIN/LAUNCHER intent (-W) — `am start -n <alias>` is unreliable
	if (comp.includes("/"))
		await C.adb(
			"shell",
			"am",
			"start",
			"-W",
			"-a",
			"android.intent.action.MAIN",
			"-c",
			"android.intent.category.LAUNCHER",
			"-n",
			comp,
		).nothrow();
	else
		await C.adb(
			"shell",
			"monkey",
			"-p",
			C.PKG,
			"-c",
			"android.intent.category.LAUNCHER",
			"1",
		).nothrow();
	await Bun.sleep(Math.max(DWELL, 14) * 1000);

	C.log("grid: scroll a few rows");
	for (let i = 0; i < 3; i++) {
		await swipeUp();
		await Bun.sleep(2000);
	}

	C.log("open inbox");
	if (!(await tapMatch(/Messages|Inbox|Chats|Taps/))) await tap(756, 2260);
	await Bun.sleep(DWELL * 1000);

	C.log("open first conversation");
	await tap(540, 520);
	await Bun.sleep(DWELL * 1000);

	await back();
	await Bun.sleep(2000);
	await back();
	C.log("drive complete");
}

if (import.meta.main) await drive();
