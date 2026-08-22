import type { ClientHello } from "./ja.ts";

export interface Segment {
	tsMicros: number;
	srcIp: string;
	dstIp: string;
	srcPort: number;
	dstPort: number;
	seq: number;
	payload: Uint8Array;
}

export interface Connection {
	srcIp: string;
	dstIp: string;
	srcPort: number;
	dstPort: number;
	firstTsMicros: number;
	lastTsMicros: number;
	clientBytes: number;
	serverBytes: number;
	clientHello: ClientHello | null;
}

const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const ipv4 = (b: Uint8Array, o: number) =>
	`${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`;
const ipv6 = (b: Uint8Array, o: number) =>
	Array.from({ length: 8 }, (_, i) => u16(b, o + i * 2).toString(16)).join(
		":",
	);

function stripLinkLayer(
	lt: number,
	b: Uint8Array,
	off: number,
): [number, number] | null {
	if (lt === 1) {
		let et = u16(b, off + 12);
		let l3 = off + 14;
		while (et === 0x8100 || et === 0x88a8) {
			et = u16(b, l3 + 2);
			l3 += 4;
		}
		return [et, l3];
	}
	if (lt === 101) return [b[off] >> 4 === 6 ? 0x86dd : 0x0800, off];
	if (lt === 113) return [u16(b, off + 14), off + 16];
	if (lt === 276) return [u16(b, off), off + 20];
	// DLT_NULL / DLT_LOOP (utun/loopback): 4-byte address family, AF_INET==2.
	if (lt === 0) {
		const af =
			b[off] |
			(b[off + 1] << 8) |
			(b[off + 2] << 16) |
			(b[off + 3] << 24);
		return [af === 2 ? 0x0800 : 0x86dd, off + 4];
	}
	if (lt === 108) {
		const af =
			(b[off] << 24) |
			(b[off + 1] << 16) |
			(b[off + 2] << 8) |
			b[off + 3];
		return [af === 2 ? 0x0800 : 0x86dd, off + 4];
	}
	return null;
}

function parseSegment(
	lt: number,
	buf: Uint8Array,
	off: number,
	inclLen: number,
	tsMicros: number,
): Segment | null {
	const end = off + inclLen;
	const link = stripLinkLayer(lt, buf, off);
	if (!link) return null;
	const [et, l3] = link;

	let proto: number, srcIp: string, dstIp: string, l4: number;
	if (et === 0x0800) {
		if (l3 + 20 > end) return null;
		proto = buf[l3 + 9];
		srcIp = ipv4(buf, l3 + 12);
		dstIp = ipv4(buf, l3 + 16);
		l4 = l3 + (buf[l3] & 0x0f) * 4;
	} else if (et === 0x86dd) {
		if (l3 + 40 > end) return null;
		proto = buf[l3 + 6];
		srcIp = ipv6(buf, l3 + 8);
		dstIp = ipv6(buf, l3 + 24);
		l4 = l3 + 40;
	} else return null;

	if (proto !== 6 || l4 + 20 > end) return null;
	const seq =
		(buf[l4 + 4] * 0x1000000 +
			(buf[l4 + 5] << 16) +
			(buf[l4 + 6] << 8) +
			buf[l4 + 7]) >>>
		0;
	const payStart = l4 + ((buf[l4 + 12] >> 4) & 0x0f) * 4;
	return {
		tsMicros,
		srcIp,
		dstIp,
		srcPort: u16(buf, l4),
		dstPort: u16(buf, l4 + 2),
		seq,
		payload: buf.subarray(payStart, end),
	};
}

export function readPcap(buf: Uint8Array): Segment[] {
	if (buf.length < 24) throw new Error("file too small to be pcap");
	const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const magic = dv.getUint32(0, false);
	const little = magic === 0xd4c3b2a1 || magic === 0x4d3cb2a1;
	const nano = magic === 0xa1b23c4d || magic === 0x4d3cb2a1;
	if (!little && magic !== 0xa1b2c3d4 && magic !== 0xa1b23c4d) {
		if (magic === 0x0a0d0d0a)
			throw new Error("pcapng unsupported; capture classic pcap");
		throw new Error(`unrecognized pcap magic 0x${magic.toString(16)}`);
	}
	const u32 = (o: number) => dv.getUint32(o, little);
	const lt = u32(20);
	const segs: Segment[] = [];
	let off = 24;
	while (off + 16 <= buf.length) {
		const inclLen = u32(off + 8);
		const ts =
			u32(off) * 1_000_000 + (nano ? u32(off + 4) / 1000 : u32(off + 4));
		off += 16;
		if (off + inclLen > buf.length) break;
		const seg = parseSegment(lt, buf, off, inclLen, ts);
		if (seg) segs.push(seg);
		off += inclLen;
	}
	return segs;
}

export function parseClientHello(data: Uint8Array): ClientHello | null {
	if (data.length < 6 || data[0] !== 0x16) return null;
	const rec = data.subarray(5, 5 + u16(data, 3));
	if (rec.length < 4 || rec[0] !== 0x01) return null;

	const ch: ClientHello = {
		legacyVersion: u16(rec, 4),
		cipherSuites: [],
		extensions: [],
		supportedGroups: [],
		ecPointFormats: [],
		sigAlgs: [],
		supportedVersions: [],
		alpn: [],
		hasSni: false,
		sni: null,
	};

	let p = 6 + 32; // handshake header + version + random
	p += 1 + rec[p]; // session id
	if (p + 2 > rec.length) return null;
	const csLen = u16(rec, p);
	p += 2;
	for (let i = 0; i + 1 < csLen; i += 2)
		ch.cipherSuites.push(u16(rec, p + i));
	p += csLen;
	p += 1 + rec[p]; // compression
	if (p + 2 > rec.length) return ch;

	const extEnd = Math.min(rec.length, p + 2 + u16(rec, p));
	p += 2;
	const dec = new TextDecoder();
	while (p + 4 <= extEnd) {
		const type = u16(rec, p);
		const len = u16(rec, p + 2);
		const body = rec.subarray(p + 4, p + 4 + len);
		p += 4 + len;
		ch.extensions.push(type);
		if (type === 0x0000) {
			ch.hasSni = true;
			if (body.length >= 5)
				ch.sni = dec.decode(body.subarray(5, 5 + u16(body, 3)));
		} else if (type === 0x000a) {
			for (let i = 0; i + 1 < u16(body, 0); i += 2)
				ch.supportedGroups.push(u16(body, 2 + i));
		} else if (type === 0x000b) {
			for (let i = 0; i < body[0]; i++)
				ch.ecPointFormats.push(body[1 + i]);
		} else if (type === 0x000d) {
			for (let i = 0; i + 1 < u16(body, 0); i += 2)
				ch.sigAlgs.push(u16(body, 2 + i));
		} else if (type === 0x0010) {
			let q = 2;
			while (q < body.length) {
				ch.alpn.push(dec.decode(body.subarray(q + 1, q + 1 + body[q])));
				q += 1 + body[q];
			}
		} else if (type === 0x002b) {
			for (let i = 0; i + 1 < body[0]; i += 2)
				ch.supportedVersions.push(u16(body, 1 + i));
		}
	}
	return ch;
}

function stitchClientHead(segs: Segment[], want = 16384): Uint8Array {
	const withPayload = segs.filter((s) => s.payload.length > 0);
	if (!withPayload.length) return new Uint8Array(0);
	const base = Math.min(...withPayload.map((s) => s.seq));
	const buf = new Uint8Array(want);
	let max = 0;
	for (const s of withPayload) {
		const off = s.seq - base;
		if (off < 0 || off >= want) continue;
		const n = Math.min(s.payload.length, want - off);
		buf.set(s.payload.subarray(0, n), off);
		max = Math.max(max, off + n);
	}
	return buf.subarray(0, max);
}

export function buildConnections(segs: Segment[]): Connection[] {
	const conns = new Map<string, Connection>();
	const flows = new Map<string, Segment[]>();
	const key = (a: string, ap: number, b: string, bp: number) =>
		a < b || (a === b && ap <= bp)
			? `${a}:${ap}-${b}:${bp}`
			: `${b}:${bp}-${a}:${ap}`;

	for (const s of segs) {
		const ck = key(s.srcIp, s.srcPort, s.dstIp, s.dstPort);
		let c = conns.get(ck);
		if (!c) {
			c = {
				srcIp: s.srcIp,
				dstIp: s.dstIp,
				srcPort: s.srcPort,
				dstPort: s.dstPort,
				firstTsMicros: s.tsMicros,
				lastTsMicros: s.tsMicros,
				clientBytes: 0,
				serverBytes: 0,
				clientHello: null,
			};
			conns.set(ck, c);
		}
		c.firstTsMicros = Math.min(c.firstTsMicros, s.tsMicros);
		c.lastTsMicros = Math.max(c.lastTsMicros, s.tsMicros);
		if (s.dstPort === 443 || s.srcPort !== 443)
			c.clientBytes += s.payload.length;
		else c.serverBytes += s.payload.length;
		if (s.dstPort === 443) {
			const fk = `${s.srcIp}:${s.srcPort}`;
			(flows.get(fk) ?? flows.set(fk, []).get(fk)!).push(s);
		}
	}

	for (const fsegs of flows.values()) {
		const ch = parseClientHello(stitchClientHead(fsegs));
		if (!ch) continue;
		const s0 = fsegs[0];
		const c = conns.get(key(s0.srcIp, s0.srcPort, s0.dstIp, s0.dstPort));
		if (c && !c.clientHello) c.clientHello = ch;
	}

	return [...conns.values()].sort(
		(a, b) => a.firstTsMicros - b.firstTsMicros,
	);
}
