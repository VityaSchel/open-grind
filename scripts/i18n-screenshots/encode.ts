import sharp from "sharp";

const WEBP = { quality: 85, effort: 6, smartSubsample: true } as const;
const MAX_BYTES = 950_000;
const MAX_SIDE = 2000;

export type EncodedView = {
	webp: Buffer;
	sha256: string;
	pixelHash: string;
	width: number;
	height: number;
};

function sha256Hex(...chunks: (string | Uint8Array)[]): string {
	const hasher = new Bun.CryptoHasher("sha256");
	for (const chunk of chunks) hasher.update(chunk);
	return hasher.digest("hex");
}

export async function encodeView(png: Buffer): Promise<EncodedView> {
	const { data, info } = await sharp(png)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const { width, height } = info;
	if (width > MAX_SIDE || height > MAX_SIDE) {
		throw new Error(
			`The ${width}x${height} capture is larger than ${MAX_SIDE}x${MAX_SIDE}`,
		);
	}
	const webp = await sharp(data, {
		raw: { width, height, channels: info.channels },
	})
		.webp(WEBP)
		.toBuffer();
	if (webp.byteLength > MAX_BYTES) {
		throw new Error(
			`The WebP image takes ${webp.byteLength} bytes, over ${MAX_BYTES}`,
		);
	}
	return {
		webp,
		sha256: sha256Hex(webp),
		pixelHash: sha256Hex(`${width}x${height}\n`, data),
		width,
		height,
	};
}
