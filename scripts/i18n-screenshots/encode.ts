import { createHash } from "node:crypto";
import sharp from "sharp";

const WEBP = { quality: 85, effort: 6, smartSubsample: true } as const;
const MAX_BYTES = 950_000;
const MAX_SIDE = 2000;

export const CHANNELS = 4;

export type Pixels = { data: Buffer; width: number; height: number };

export type EncodedImage = { webp: Buffer; sha256: string; pixelHash: string };

function sha256Hex(...chunks: (string | Uint8Array)[]): string {
	const hash = createHash("sha256");
	for (const chunk of chunks) hash.update(chunk);
	return hash.digest("hex");
}

export async function decodeCapture(png: Buffer): Promise<Pixels> {
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
	return { data, width, height };
}

export async function encodeView({
	data,
	width,
	height,
}: Pixels): Promise<EncodedImage> {
	const webp = await sharp(data, {
		raw: { width, height, channels: CHANNELS },
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
	};
}
