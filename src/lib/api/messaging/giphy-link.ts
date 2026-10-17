import { fetchExternal } from "$lib/api/transport";
import { demoEnabled, demoLinkedGifSize } from "$lib/demo";
import { giphyMediaSrc, type GiphyTile } from "./giphy";

type GifSize = { width: number; height: number };

const RENDITIONS = [
	{ animated: "200.gif", still: "200_s.gif" },
	{ animated: "200w.gif", still: "200w_s.gif" },
	{ animated: "giphy.gif", still: "giphy_s.gif" },
] as const;

const GIPHY_ID = /^[A-Za-z0-9]+$/;
const MEDIA_HOST = /^media[0-4]?\.giphy\.com$/;
const GIF_SIGNATURE = "GIF8";
const GIF_HEADER_LENGTH = 10;

function linkUrl(text: string): URL | null {
	const trimmed = text.trim();
	if (trimmed === "" || /\s/.test(trimmed)) return null;
	const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	try {
		const url = new URL(withScheme);
		return url.protocol === "https:" || url.protocol === "http:"
			? url
			: null;
	} catch {
		return null;
	}
}

function idInPath({ hostname, pathname }: URL): string | undefined {
	const host = hostname.replace(/^www\./, "");
	const [first, second, third] = pathname.split("/").filter(Boolean);
	if (host === "giphy.com") {
		if (first === "gifs" || first === "stickers")
			return second?.split("-").at(-1);
		return first === "embed" ? second : undefined;
	}
	if (MEDIA_HOST.test(host) && first === "media")
		return second?.startsWith("v1.") ? third : second;
	if (host === "i.giphy.com")
		return first === "media"
			? second
			: first?.replace(/\.(?:gif|webp)$/, "");
	return undefined;
}

export function giphyOriginalUrl({
	id,
	urlPath,
}: {
	id: string;
	urlPath: string;
}): string {
	return GIPHY_ID.test(id)
		? `https://media.giphy.com/media/${id}/giphy.gif`
		: urlPath;
}

export function giphyIdFromLink(text: string): string | null {
	const url = linkUrl(text);
	const id = url === null ? undefined : idInPath(url);
	return id !== undefined && GIPHY_ID.test(id) ? id : null;
}

function gifSize(bytes: Uint8Array): GifSize {
	const signature = new TextDecoder().decode(bytes.subarray(0, 4));
	if (signature !== GIF_SIGNATURE || bytes.length < GIF_HEADER_LENGTH)
		throw new Error("GIPHY sent something that isn't a GIF");
	const header = new DataView(bytes.buffer, bytes.byteOffset);
	return {
		width: header.getUint16(6, true),
		height: header.getUint16(8, true),
	};
}

async function fetchHeaderSize(url: string): Promise<GifSize | null> {
	const response = await fetchExternal({
		url: new URL(url),
		range: `bytes=0-${GIF_HEADER_LENGTH - 1}`,
	});
	if (response.status === 404) return null;
	response.assertOk();
	return gifSize(response.bytes());
}

async function fetchRenditionSize({
	id,
	urlPath,
	stillPath,
}: {
	id: string;
	urlPath: string;
	stillPath: string;
}): Promise<GifSize | null> {
	if (demoEnabled) return demoLinkedGifSize(id);
	const [size, stillSize] = await Promise.all([
		fetchHeaderSize(urlPath),
		fetchHeaderSize(stillPath),
	]);
	return stillSize === null ? null : size;
}

export async function getGifByLink(id: string): Promise<GiphyTile | null> {
	const media = `https://media.giphy.com/media/${id}`;
	for (const { animated, still } of RENDITIONS) {
		const urlPath = `${media}/${animated}`;
		const stillPath = `${media}/${still}`;
		const size = await fetchRenditionSize({ id, urlPath, stillPath });
		if (size === null) continue;
		return {
			id,
			tileUrl: giphyMediaSrc(urlPath),
			stillTileUrl: giphyMediaSrc(stillPath),
			alt: "GIF from a GIPHY link",
			body: {
				id,
				urlPath,
				previewPath: urlPath,
				stillPath,
				...size,
				imageHash: `giphy/${id}`,
			},
		};
	}
	return null;
}
