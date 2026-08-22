#!/usr/bin/env bun
// pcap (emulator -tcpdump or PCAPdroid) -> one JSON line per TLS connection.
//   bun src/analyze.ts capture.pcap [--json]   |   bun src/analyze.ts --self-test

import {
	type ClientHello,
	computeJa3,
	computeJa4,
	isWarm,
	selfTest,
} from "./ja.ts";
import { buildConnections, type Connection, readPcap } from "./pcap.ts";

const GRINDR: Record<string, string> = {
	t13d1513h2_8daaf6152771_eca864cca44a: "grindr-cold",
	t13d1514h2_8daaf6152771_fadfdae04b4e: "grindr-warm",
	t13d1514h1_8daaf6152771_fadfdae04b4e: "grindr-warm-h1",
};
const grindrMatch = (ja4: string) =>
	GRINDR[ja4] ??
	(ja4.startsWith("t13") && ja4.includes("8daaf6152771")
		? "grindr-ciphers-only"
		: null);

function toLine(c: Connection, startMicros: number) {
	const ch = c.clientHello as ClientHello;
	const { full, hash } = computeJa3(ch);
	const ja4 = computeJa4(ch);
	return {
		kind: "tls-connection",
		t_ms: Math.round((c.firstTsMicros - startMicros) / 1000),
		host: ch.sni ?? c.dstIp,
		dst: `${c.dstIp}:${c.dstPort}`,
		alpn: ch.alpn,
		state: isWarm(ch) ? "warm" : "cold",
		ja3: hash,
		ja4,
		ja3_full: full,
		client_bytes: c.clientBytes,
		server_bytes: c.serverBytes,
		match: grindrMatch(ja4),
	};
}
export type Line = ReturnType<typeof toLine>;

export function analyze(bytes: Uint8Array, onlyIps?: Set<string>) {
	const segs = readPcap(bytes);
	const conns = buildConnections(segs).filter(
		(c) => !onlyIps || onlyIps.has(c.dstIp),
	);
	const start = conns[0]?.firstTsMicros ?? 0;
	const lines = conns
		.filter((c) => c.clientHello)
		.map((c) => toLine(c, start));
	const flows443 = new Set(
		segs
			.filter((s) => s.dstPort === 443)
			.map((s) => `${s.srcIp}:${s.srcPort}`),
	).size;
	return { lines, tcpSegments: segs.length, flows443 };
}

export function summarize(
	lines: Line[],
	tcpSegments: number,
	flows443: number,
): string {
	if (!lines.length)
		return `# no TLS connections. tcp-segments=${tcpSegments} dst:443-flows=${flows443}\n# ${flows443 ? "443 flows exist but no ClientHello parsed — widen the window" : "no HTTPS-over-TCP — check network/dwell, or hosts used QUIC (FORCE_TCP=1)"}`;
	const byHost = new Map<string, Set<string>>();
	for (const l of lines)
		(byHost.get(l.host) ?? byHost.set(l.host, new Set()).get(l.host)!).add(
			l.ja4,
		);
	const out = [`# ${lines.length} TLS connections, ${byHost.size} hosts`];
	for (const [host, ja4s] of byHost)
		out.push(`#   ${host}  [${[...ja4s].join(" | ")}]`);
	const gap = [...byHost.keys()].filter((h) => !h.includes("grindr"));
	if (gap.length)
		out.push(
			`# behavioral gap (hosts Open Grind should mirror): ${gap.join(", ")}`,
		);
	return out.join("\n");
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.includes("--self-test")) {
		const fails = selfTest();
		console.error(
			fails.length ? "FAIL\n" + fails.join("\n") : "self-test PASS",
		);
		process.exit(fails.length ? 1 : 0);
	}
	const path = args.find((a) => !a.startsWith("--"));
	if (!path) {
		console.error("usage: bun src/analyze.ts <capture.pcap> [--json]");
		process.exit(2);
	}
	const { lines, tcpSegments, flows443 } = analyze(
		await Bun.file(path).bytes(),
	);
	if (!args.includes("--json"))
		console.error(summarize(lines, tcpSegments, flows443));
	for (const l of lines) console.log(JSON.stringify(l));
}
