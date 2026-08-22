#!/usr/bin/env bun

import { openSync } from "node:fs";

import { analyze, summarize } from "./analyze.ts";
import { boot, kill } from "./avd.ts";
import * as C from "./config.ts";
import { drive } from "./drive.ts";

const num = (name: string, d: number) => Number(process.env[name] ?? d);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const pcap = `${C.OUT_DIR}/capture-${stamp}.pcap`;

let stop = false;
let td: ReturnType<typeof Bun.spawn> | null = null;
const emuIps = new Set<string>();

async function collectIps() {
	for (const ip of await C.emulatorRemoteIps(await C.qemuPids()))
		emuIps.add(ip);
}

try {
	await boot(false);
	C.log(
		`readiness wait ${num("READY", 30)}s (PairIP license + Play/network)`,
	);
	await Bun.sleep(num("READY", 30) * 1000);

	const fd = openSync(`${C.OUT_DIR}/tcpdump.log`, "w");
	td = Bun.spawn(
		["tcpdump", "-i", C.CAP_IFACE, "-w", pcap, "-U", "tcp port 443"],
		{ stdout: fd, stderr: fd, stdin: "ignore" },
	);
	await Bun.sleep(1500);
	C.log(`host capture on ${C.CAP_IFACE} -> ${pcap}`);

	// stream the GPS fix + poll the emulator's live remote IPs, both until teardown
	(async () => {
		while (!stop) {
			await C.adb("emu", "geo", "fix", C.GEO_LON, C.GEO_LAT).nothrow();
			await Bun.sleep(1500);
		}
	})().catch(() => "");
	(async () => {
		while (!stop) {
			await collectIps();
			await Bun.sleep(3000);
		}
	})().catch(() => "");

	await drive().catch((e) => C.log(`drive issue (continuing): ${e}`));
	await Bun.sleep(num("LINGER", 4) * 1000);
	await collectIps();
} finally {
	stop = true;
	td?.kill(2);
	await Bun.sleep(1500);
	await kill();
}

const bytes = await Bun.file(pcap)
	.bytes()
	.catch(() => new Uint8Array());
if (!bytes.length)
	C.die(
		`empty pcap ${pcap} — is CAP_IFACE=${C.CAP_IFACE} the egress interface? (see out/tcpdump.log)`,
	);

C.log(`isolated ${emuIps.size} emulator remote IPs`);
const { lines, tcpSegments, flows443 } = analyze(
	bytes,
	emuIps.size ? emuIps : undefined,
);
console.error(summarize(lines, tcpSegments, flows443));
const jsonl = lines.map((l) => JSON.stringify(l)).join("\n");
await Bun.write(pcap.replace(/\.pcap$/, ".jsonl"), jsonl + "\n");
console.log(jsonl);
