import { fetchExternal } from "$lib/api/transport";
import { demoEnabled, demoGiphyMediaUrl } from "$lib/demo";
import {
	GIPHY_MEDIA_HOST,
	type GiphyBody,
	giphyBody,
	type GiphyGif,
	type GiphyPagination,
	giphyResponseSchema,
} from "$lib/model/messaging/gifs";
import { systemLanguage } from "$lib/util/language";
import { proxyMediaUrl } from "$lib/util/media";

const GIPHY_ORIGIN = "https://api.giphy.com";
const GIPHY_API_KEY = "zf7gBZ531pHaTJN3ne0jDdAepsNreB2X";
const GIPHY_PAGE_SIZE = 50;
const GIPHY_RATING = "r";
const GIPHY_MAX_OFFSET = { trending: 499, search: 4999 } as const;

export type GiphyTile = {
	id: string;
	tileUrl: string;
	stillTileUrl: string;
	alt: string;
	body: GiphyBody;
};

export type GiphyPage = { gifs: GiphyTile[]; nextOffset: number | null };

function giphyTrendingPath({ offset }: { offset: number }): string {
	const offsetParam = offset === 0 ? "" : `&offset=${offset}`;
	return `/v1/gifs/trending?limit=${GIPHY_PAGE_SIZE}&rating=${GIPHY_RATING}${offsetParam}&api_key=${GIPHY_API_KEY}`;
}

function okHttpQueryComponent(value: string): string {
	return encodeURIComponent(value).replaceAll(
		/[!'()~]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

function giphySearchPath({
	query,
	offset,
	language,
}: {
	query: string;
	offset: number;
	language: string;
}): string {
	return `/v1/gifs/search?limit=${GIPHY_PAGE_SIZE}&rating=${GIPHY_RATING}&q=${okHttpQueryComponent(query)}&offset=${offset}&api_key=${GIPHY_API_KEY}&lang=${language}`;
}

function nextGiphyOffset({
	pagination,
	maxOffset,
}: {
	pagination: GiphyPagination | undefined;
	maxOffset: number;
}): number | null {
	if (pagination === undefined || pagination.count === 0) return null;
	const next = pagination.offset + pagination.count;
	if (next >= pagination.total_count || next > maxOffset) return null;
	return next;
}

export function giphyMediaSrc(url: string): string {
	return demoEnabled ? demoGiphyMediaUrl(url) : proxyMediaUrl(url);
}

function isGiphyMediaUrl(url: string): boolean {
	try {
		const { protocol, hostname } = new URL(url);
		return protocol === "https:" && GIPHY_MEDIA_HOST.test(hostname);
	} catch {
		return false;
	}
}

export function receivedGiphySrc(url: string): string | null {
	return isGiphyMediaUrl(url) ? giphyMediaSrc(url) : null;
}

function tileUrlOf({
	fixed_width_downsampled: rendition,
}: GiphyGif["images"]): string {
	return rendition.webp === undefined ? rendition.url : rendition.webp;
}

function giphyTile(gif: GiphyGif): GiphyTile {
	const { fixed_height: animated, fixed_height_still: still } = gif.images;
	return {
		id: gif.id,
		tileUrl: giphyMediaSrc(tileUrlOf(gif.images)),
		stillTileUrl: giphyMediaSrc(still.url),
		alt: gif.title || gif.alt_text || "GIF",
		body: giphyBody({
			id: gif.id,
			urlPath: animated.url,
			stillPath: still.url,
			width: animated.width,
			height: animated.height,
		}),
	};
}

async function fetchGiphyPage({
	path,
	maxOffset,
}: {
	path: string;
	maxOffset: number;
}): Promise<GiphyPage> {
	const response = await fetchExternal({ url: new URL(path, GIPHY_ORIGIN) });
	const { data, pagination } = response.jsonParsed(giphyResponseSchema);
	return {
		gifs: data.map(giphyTile),
		nextOffset: nextGiphyOffset({ pagination, maxOffset }),
	};
}

export async function getTrendingGifs({
	offset,
}: {
	offset: number;
}): Promise<GiphyPage> {
	return await fetchGiphyPage({
		path: giphyTrendingPath({ offset }),
		maxOffset: GIPHY_MAX_OFFSET.trending,
	});
}

export async function searchGifs({
	query,
	offset,
}: {
	query: string;
	offset: number;
}): Promise<GiphyPage> {
	return await fetchGiphyPage({
		path: giphySearchPath({ query, offset, language: systemLanguage() }),
		maxOffset: GIPHY_MAX_OFFSET.search,
	});
}
