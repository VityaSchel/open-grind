import type { BrowserContext } from "@playwright/test";
import sharp from "sharp";

import type { NetworkGuard } from "./network";

const TILE_HOST = "tile.openstreetmap.org";
const VIDEO_HOST = "d3w4wp6rol9nvz.cloudfront.net";
const PHOTO_HOSTS = [
	"api.dicebear.com",
	"picsum.photos",
	"images.unsplash.com",
	"cdns.grindr.com",
];
const VIDEO = new URL("video.webm", import.meta.url);
const SIZE_IN_PATH = /\/(\d+)x(\d+)(?:\/|$)/;
const TILE_SIZE = 256;
const DEFAULT_SIDE = 512;
const PICKED_PHOTO = { width: 1200, height: 1600 };

type Size = { width: number; height: number };

function positive(...values: number[]): boolean {
	return values.every((value) => Number.isInteger(value) && value > 0);
}

function requestedSize(url: URL): number[] {
	if (url.hostname === "picsum.photos") {
		return url.pathname.split("/").slice(-2).map(Number);
	}
	if (url.hostname === "images.unsplash.com") {
		return ["w", "h"].map((name) => Number(url.searchParams.get(name)));
	}
	return (url.pathname.match(SIZE_IN_PATH) ?? []).slice(1).map(Number);
}

function photoSize(url: URL): Size {
	const [width = 0, height = 0] = requestedSize(url);
	return positive(width, height)
		? { width, height }
		: { width: DEFAULT_SIDE, height: DEFAULT_SIDE };
}

function photo({ seed, width, height }: Size & { seed: string }): string {
	const hue = Bun.hash.crc32(seed) % 360;
	const head = Math.min(width, height) * 0.2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 30% 34%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 30% 16%)"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><g fill="hsl(${hue} 15% 70%)" fill-opacity="0.45"><circle cx="${width / 2}" cy="${height * 0.42}" r="${head}"/><ellipse cx="${width / 2}" cy="${height}" rx="${head * 2}" ry="${head * 1.9}"/></g></svg>`;
}

function tile(): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}"><rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="#d9dcd6"/><path d="M0 0.5H${TILE_SIZE}M0.5 0V${TILE_SIZE}" stroke="#c3c7bf"/></svg>`;
}

function servesLocalMedia(url: URL): boolean {
	return [TILE_HOST, VIDEO_HOST, ...PHOTO_HOSTS].includes(url.hostname);
}

function seededImage(url: URL): string {
	return url.hostname === TILE_HOST
		? tile()
		: photo({ seed: url.href, ...photoSize(url) });
}

export async function serveLocalMedia({
	context,
	guard,
}: {
	context: BrowserContext;
	guard: NetworkGuard;
}): Promise<void> {
	const video = Buffer.from(await Bun.file(VIDEO).arrayBuffer());
	await context.route(
		servesLocalMedia,
		guard.catching((route) => {
			const request = route.request();
			const url = new URL(request.url());
			if (
				url.hostname === VIDEO_HOST ||
				request.resourceType() === "media"
			) {
				return route.fulfill({
					contentType: "video/webm",
					body: video,
				});
			}
			return route.fulfill({
				contentType: "image/svg+xml",
				body: seededImage(url),
			});
		}),
	);
}

export type GeneratedFile = { name: string; mimeType: string; buffer: Buffer };

export function generatedPhotos(count: number): Promise<GeneratedFile[]> {
	return Promise.all(
		Array.from({ length: count }, async (_, index) => ({
			name: `photo-${index + 1}.jpg`,
			mimeType: "image/jpeg",
			buffer: await sharp(
				Buffer.from(
					photo({ seed: `picked-${index}`, ...PICKED_PHOTO }),
				),
			)
				.jpeg()
				.toBuffer(),
		})),
	);
}

export async function generatedVideos(count: number): Promise<GeneratedFile[]> {
	const buffer = Buffer.from(await Bun.file(VIDEO).arrayBuffer());
	return Array.from({ length: count }, (_, index) => ({
		name: `clip-${index + 1}.webm`,
		mimeType: "video/webm",
		buffer,
	}));
}
