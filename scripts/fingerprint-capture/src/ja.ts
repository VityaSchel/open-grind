export interface ClientHello {
	legacyVersion: number;
	cipherSuites: number[];
	extensions: number[];
	supportedGroups: number[];
	ecPointFormats: number[];
	sigAlgs: number[];
	supportedVersions: number[];
	alpn: string[];
	hasSni: boolean;
	sni: string | null;
}

// both bytes equal, low nibble 0xa (RFC 8701)
export const isGrease = (v: number): boolean =>
	(v & 0x0f0f) === 0x0a0a && v >>> 8 === (v & 0xff);

const md5 = (s: string) => new Bun.CryptoHasher("md5").update(s).digest("hex");
const sha12 = (s: string) =>
	new Bun.CryptoHasher("sha256").update(s).digest("hex").slice(0, 12);
const hex4 = (v: number) => v.toString(16).padStart(4, "0");
const noGrease = (xs: number[]) => xs.filter((v) => !isGrease(v));

export function computeJa3(ch: ClientHello): { full: string; hash: string } {
	const full = [
		ch.legacyVersion,
		noGrease(ch.cipherSuites).join("-"),
		noGrease(ch.extensions).join("-"),
		noGrease(ch.supportedGroups).join("-"),
		noGrease(ch.ecPointFormats).join("-"),
	].join(",");
	return { full, hash: md5(full) };
}

export function computeJa4(ch: ClientHello): string {
	const versions = noGrease(ch.supportedVersions);
	const highest = versions.length ? Math.max(...versions) : ch.legacyVersion;
	const ver =
		{
			0x0304: "13",
			0x0303: "12",
			0x0302: "11",
			0x0301: "10",
			0x0300: "s3",
		}[highest] ?? "00";
	const two = (n: number) => Math.min(99, n).toString().padStart(2, "0");
	const a0 = ch.alpn[0];
	const alpn = a0 ? `${a0[0]}${a0.at(-1)}` : "00";
	const a = `t${ver}${ch.hasSni ? "d" : "i"}${two(noGrease(ch.cipherSuites).length)}${two(noGrease(ch.extensions).length)}${alpn}`;

	const b = noGrease(ch.cipherSuites)
		.sort((x, y) => x - y)
		.map(hex4)
		.join(",");
	// SNI(0) and ALPN(16) are excluded from the "c" list by spec
	const exts = noGrease(ch.extensions)
		.filter((v) => v !== 0 && v !== 0x10)
		.sort((x, y) => x - y)
		.map(hex4)
		.join(",");
	const sig = noGrease(ch.sigAlgs).map(hex4).join(",");
	return `${a}_${sha12(b)}_${sha12(sig ? `${exts}_${sig}` : exts)}`;
}

export const isWarm = (ch: ClientHello) => ch.extensions.includes(0x29);

export function selfTest(): string[] {
	const ciphers = [
		4865, 4866, 4867, 49195, 49199, 49196, 49200, 52393, 52392, 49171,
		49172, 156, 157, 47, 53,
	];
	const base = {
		legacyVersion: 0x0303,
		cipherSuites: ciphers,
		supportedGroups: [29, 23, 24],
		ecPointFormats: [0],
		sigAlgs: [
			0x0403, 0x0804, 0x0401, 0x0503, 0x0805, 0x0501, 0x0806, 0x0601,
			0x0201,
		],
		supportedVersions: [0x0304, 0x0303],
		alpn: ["h2", "http/1.1"],
		hasSni: true,
		sni: "grindr.mobi",
	};
	const coldE = [0, 23, 65281, 10, 11, 35, 16, 5, 13, 51, 45, 43, 21];
	const cold: ClientHello = { ...base, extensions: coldE };
	const warm: ClientHello = { ...base, extensions: [...coldE, 41] };
	const warmH1: ClientHello = { ...warm, alpn: ["http/1.1"] };

	const fails: string[] = [];
	const eq = (n: string, got: string, want: string) =>
		got !== want && fails.push(`${n}: ${got} != ${want}`);
	eq("cold ja3", computeJa3(cold).hash, "1d714db2228763eab228fc28ce7f8e4f");
	eq("cold ja4", computeJa4(cold), "t13d1513h2_8daaf6152771_eca864cca44a");
	eq("warm ja3", computeJa3(warm).hash, "62e5cbd375390b136bf5b06be231ed6b");
	eq("warm ja4", computeJa4(warm), "t13d1514h2_8daaf6152771_fadfdae04b4e");
	eq(
		"warm ja4 h1",
		computeJa4(warmH1),
		"t13d1514h1_8daaf6152771_fadfdae04b4e",
	);
	return fails;
}
