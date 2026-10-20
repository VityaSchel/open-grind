import { giphyBody } from "$lib/model/messaging/gifs";
import { hashString } from "$lib/util/random";
import type { MediaDimensions } from "$lib/util/media-dimensions";

const DEMO_GIPHY_TRENDING_TOTAL = 172;
const DEMO_GIPHY_EMPTY_QUERY = "zzzz";
const DEMO_GIPHY_MISSING_ID = "NoSuchDemoGif";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const RENDITION_SIZE = 200;
const ID_ALPHABET =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ASPECT_RATIOS = [1, 4 / 3, 16 / 9, 3 / 4, 3 / 2, 9 / 16, 1.85, 5 / 4];
const TRENDING_PHRASES = [
	"Hello",
	"Thank You",
	"Love You",
	"Dance",
	"Wink",
	"Yes",
	"No Way",
	"Laughing",
	"Party",
	"Hug",
	"Wow",
	"Bye",
	"Excited",
	"Good Morning",
	"Eye Roll",
	"Facepalm",
];

type DemoGif = { id: string; title: string };

function demoGifId(seed: string): string {
	let state = hashString(seed);
	let id = "";
	while (id.length < 18) {
		state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0;
		state = (state ^ (state >>> 13)) >>> 0;
		id += ID_ALPHABET[state % ID_ALPHABET.length];
	}
	return id;
}

function aspectRatioOf(id: string): number {
	return ASPECT_RATIOS[hashString(id) % ASPECT_RATIOS.length] ?? 1;
}

function fixedWidthSize(id: string): MediaDimensions {
	return {
		width: RENDITION_SIZE,
		height: Math.round(RENDITION_SIZE / aspectRatioOf(id)),
	};
}

function fixedHeightSize(id: string): MediaDimensions {
	return {
		width: Math.round(RENDITION_SIZE * aspectRatioOf(id)),
		height: RENDITION_SIZE,
	};
}

function wireSize({ width, height }: MediaDimensions) {
	return { width: String(width), height: String(height) };
}

function mediaUrl({ id, file }: { id: string; file: string }): string {
	return `https://media.giphy.com/media/${id}/${file}`;
}

function demoGifObject({ id, title }: DemoGif) {
	const fixedWidth = wireSize(fixedWidthSize(id));
	const fixedHeight = wireSize(fixedHeightSize(id));
	return {
		type: "gif",
		id,
		url: `https://giphy.com/gifs/${id}`,
		slug: id,
		title,
		alt_text: "",
		rating: "g",
		username: "",
		source: "",
		images: {
			fixed_width_downsampled: {
				...fixedWidth,
				size: "61107",
				url: mediaUrl({ id, file: "200w_d.gif" }),
				webp_size: "30926",
				webp: mediaUrl({ id, file: "200w_d.webp" }),
			},
			fixed_height: {
				...fixedHeight,
				size: "500733",
				url: mediaUrl({ id, file: "200.gif" }),
				mp4_size: "100928",
				mp4: mediaUrl({ id, file: "200.mp4" }),
				webp_size: "148732",
				webp: mediaUrl({ id, file: "200.webp" }),
			},
			fixed_height_still: {
				...fixedHeight,
				size: "20754",
				url: mediaUrl({ id, file: "200_s.gif" }),
			},
		},
	};
}

function pageParams(params: URLSearchParams): {
	offset: number;
	limit: number;
} {
	const offset = Number.parseInt(params.get("offset") ?? "0", 10);
	const limit = Number.parseInt(params.get("limit") ?? "", 10);
	return {
		offset: Number.isSafeInteger(offset) && offset > 0 ? offset : 0,
		limit:
			Number.isSafeInteger(limit) && limit > 0
				? Math.min(limit, MAX_LIMIT)
				: DEFAULT_LIMIT,
	};
}

function demoGiphyPage({
	params,
	total,
	gifAt,
}: {
	params: URLSearchParams;
	total: number;
	gifAt: (index: number) => DemoGif;
}) {
	const { offset, limit } = pageParams(params);
	const end = Math.min(offset + limit, total);
	const data = [];
	for (let index = offset; index < end; index++) {
		data.push(demoGifObject(gifAt(index)));
	}
	return {
		data,
		meta: {
			status: 200,
			msg: "OK",
			response_id: demoGifId(`${params.toString()}#response`),
		},
		pagination: { total_count: total, count: data.length, offset },
	};
}

export function demoGiphyTrending(params: URLSearchParams) {
	return demoGiphyPage({
		params,
		total: DEMO_GIPHY_TRENDING_TOTAL,
		gifAt: (index) => ({
			id: demoGifId(`trending#${index}`),
			title: `${TRENDING_PHRASES[index % TRENDING_PHRASES.length]} GIF`,
		}),
	});
}

function searchTotal(query: string): number {
	if (query === DEMO_GIPHY_EMPTY_QUERY) return 0;
	return 60 + (hashString(query) % 240);
}

export function demoGiphySearch(params: URLSearchParams) {
	const query = (params.get("q") ?? "").trim().toLowerCase();
	const words = query.split(/\s+/).filter(Boolean);
	const title = words
		.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join(" ");
	return demoGiphyPage({
		params,
		total: words.length === 0 ? 0 : searchTotal(query),
		gifAt: (index) => ({
			id: demoGifId(`search#${query}#${index}`),
			title: `${title} GIF ${index + 1}`,
		}),
	});
}

export function demoGiphyMessageBody(seed: string) {
	const id = demoGifId(seed);
	return giphyBody({
		id,
		urlPath: mediaUrl({ id, file: "200.gif" }),
		stillPath: mediaUrl({ id, file: "200_s.gif" }),
		...fixedHeightSize(id),
	});
}

export function demoLinkedGifSize(id: string): MediaDimensions | null {
	if (id === DEMO_GIPHY_MISSING_ID) return null;
	return fixedHeightSize(id);
}

function svgDataUrl(svg: string): string {
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function renditionSize({
	id,
	file,
}: {
	id: string;
	file: string;
}): MediaDimensions {
	if (file.startsWith("200w")) return fixedWidthSize(id);
	if (file.startsWith("200")) return fixedHeightSize(id);
	return { width: RENDITION_SIZE, height: RENDITION_SIZE };
}

export function demoGiphyMediaUrl(url: string): string {
	const [, id = "", file = ""] =
		/\/media\/([^/]+)\/([^/]+)$/.exec(new URL(url).pathname) ?? [];
	const { width, height } = renditionSize({ id, file });
	const hue = hashString(id) % 360;
	return svgDataUrl(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
			`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
			`<stop offset="0" stop-color="hsl(${hue} 70% 55%)"/>` +
			`<stop offset="1" stop-color="hsl(${(hue + 50) % 360} 70% 35%)"/>` +
			`</linearGradient></defs>` +
			`<rect width="${width}" height="${height}" fill="url(#g)"/>` +
			`<text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-size="32" font-weight="700" text-anchor="middle" dominant-baseline="central">GIF</text>` +
			`</svg>`,
	);
}
