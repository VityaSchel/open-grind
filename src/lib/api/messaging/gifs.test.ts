import { encode } from "@msgpack/msgpack";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, markRequestBlockedMock, signOutIfSessionLostMock } =
	vi.hoisted(() => ({
		invokeMock: vi.fn(),
		markRequestBlockedMock: vi.fn(),
		signOutIfSessionLostMock: vi.fn(),
	}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	markRequestBlocked: markRequestBlockedMock,
}));
vi.mock("$lib/api/session-lost", () => ({
	signOutIfSessionLost: signOutIfSessionLostMock,
}));

import { ApiError } from "$lib/api/api-error";
import {
	getTrendingGifs,
	receivedGiphySrc,
	searchGifs,
} from "$lib/api/messaging/gifs";
import { toBase64 } from "$lib/util/base64";

const KEY = "zf7gBZ531pHaTJN3ne0jDdAepsNreB2X";
const media =
	"https://media2.giphy.com/media/v1.Y2lkPTA1Njg2OTFlaTZubjdsdG9kcWZ1eXJhemIyMnV3Zmg4ZmMyeGM2MHkycDY0OWYwOCZlcD12MV9naWZzX3RyZW5kaW5nJmN0PWc/xT0xeChUR33EsYNNRK";

function capturedGif({
	id = "xT0xeChUR33EsYNNRK",
	title = "Season 2 No GIF by Portlandia",
	altText = "",
}: { id?: string; title?: string; altText?: string } = {}) {
	return {
		type: "gif",
		id,
		title,
		alt_text: altText,
		images: {
			fixed_height: {
				height: "200",
				width: "356",
				size: "500733",
				url: `${media}/200.gif`,
				webp: `${media}/200.webp`,
			},
			fixed_height_still: {
				height: "200",
				width: "356",
				size: "20754",
				url: `${media}/200_s.gif`,
			},
			fixed_width_downsampled: {
				height: "113",
				width: "200",
				size: "61107",
				url: `${media}/200w_d.gif`,
				webp: `${media}/200w_d.webp`,
			},
		},
	};
}

function respond({ status = 200, body }: { status?: number; body: unknown }) {
	invokeMock.mockResolvedValueOnce(
		toBase64(
			encode({
				status,
				body: new TextEncoder().encode(JSON.stringify(body)),
			}),
		),
	);
}

function respondWithPage({
	data = [capturedGif()],
	pagination,
}: {
	data?: unknown[];
	pagination?: { total_count: number; count: number; offset: number };
}) {
	respond({ body: { data, pagination, meta: { status: 200, msg: "OK" } } });
}

function requestedUrl(): string {
	expect(invokeMock).toHaveBeenCalledTimes(1);
	const [command, args] = invokeMock.mock.calls[0] ?? [];
	expect(command).toBe("fetch_external");
	return (args as { url: string }).url;
}

beforeEach(() => {
	invokeMock.mockReset();
	markRequestBlockedMock.mockReset();
	signOutIfSessionLostMock.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("getTrendingGifs", () => {
	it("requests the first page exactly like the official app", async () => {
		respondWithPage({
			pagination: { total_count: 172, count: 50, offset: 0 },
		});

		await getTrendingGifs({ offset: 0 });

		expect(requestedUrl()).toBe(
			`https://api.giphy.com/v1/gifs/trending?limit=50&rating=r&api_key=${KEY}`,
		);
	});

	it("puts the offset before the key on later pages", async () => {
		respondWithPage({
			pagination: { total_count: 172, count: 50, offset: 50 },
		});

		await getTrendingGifs({ offset: 50 });

		expect(requestedUrl()).toBe(
			`https://api.giphy.com/v1/gifs/trending?limit=50&rating=r&offset=50&api_key=${KEY}`,
		);
	});

	it("turns each GIF into a tile and the body to send", async () => {
		respondWithPage({
			pagination: { total_count: 172, count: 50, offset: 0 },
		});

		const page = await getTrendingGifs({ offset: 0 });

		expect(page).toEqual({
			gifs: [
				{
					id: "xT0xeChUR33EsYNNRK",
					tileUrl: `${media}/200w_d.webp`,
					stillTileUrl: `${media}/200_s.gif`,
					alt: "Season 2 No GIF by Portlandia",
					body: {
						id: "xT0xeChUR33EsYNNRK",
						urlPath: `${media}/200.gif`,
						previewPath: `${media}/200.gif`,
						stillPath: `${media}/200_s.gif`,
						width: 356,
						height: 200,
						imageHash: "giphy/xT0xeChUR33EsYNNRK",
					},
				},
			],
			nextOffset: 50,
		});
	});

	it("falls back to the GIF tile when there is no WebP", async () => {
		const gif = capturedGif();
		Reflect.deleteProperty(gif.images.fixed_width_downsampled, "webp");
		respondWithPage({ data: [gif] });

		const { gifs } = await getTrendingGifs({ offset: 0 });

		expect(gifs[0]?.tileUrl).toBe(`${media}/200w_d.gif`);
	});

	it.each([
		["the title", { title: "Wave GIF", altText: "A wave" }, "Wave GIF"],
		["the alt text", { title: "", altText: "A wave" }, "A wave"],
		["a generic label", { title: "", altText: "" }, "GIF"],
	])("labels a tile with %s", async (_, names, alt) => {
		respondWithPage({ data: [capturedGif(names)] });

		const { gifs } = await getTrendingGifs({ offset: 0 });

		expect(gifs[0]?.alt).toBe(alt);
	});

	it.each([
		["no pagination", undefined, null],
		["an empty page", { total_count: 172, count: 0, offset: 450 }, null],
		["the last page", { total_count: 172, count: 22, offset: 150 }, null],
		[
			"a page that ends exactly at the total",
			{ total_count: 150, count: 50, offset: 100 },
			null,
		],
		[
			"a next page past the maximum offset",
			{ total_count: 1000, count: 50, offset: 450 },
			null,
		],
		[
			"a next page at the maximum offset",
			{ total_count: 1000, count: 49, offset: 450 },
			499,
		],
		["a middle page", { total_count: 172, count: 50, offset: 100 }, 150],
	])("reports the next offset for %s", async (_, pagination, nextOffset) => {
		respondWithPage({ pagination });

		const page = await getTrendingGifs({ offset: pagination?.offset ?? 0 });

		expect(page.nextOffset).toBe(nextOffset);
	});

	it("advances by the count GIPHY reports, not by the GIFs kept", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const broken = capturedGif({ id: "broken" });
		broken.images.fixed_height.width = "wide";
		respondWithPage({
			data: [capturedGif(), broken],
			pagination: { total_count: 172, count: 50, offset: 50 },
		});

		const page = await getTrendingGifs({ offset: 50 });

		expect(page.gifs.map(({ id }) => id)).toEqual(["xT0xeChUR33EsYNNRK"]);
		expect(page.nextOffset).toBe(100);
	});
});

describe("searchGifs", () => {
	beforeEach(() => {
		vi.spyOn(navigator, "language", "get").mockReturnValue("de-AT");
	});

	it("requests a search in the official parameter order", async () => {
		respondWithPage({
			pagination: { total_count: 4999, count: 50, offset: 0 },
		});

		await searchGifs({ query: "hello", offset: 0 });

		expect(requestedUrl()).toBe(
			`https://api.giphy.com/v1/gifs/search?limit=50&rating=r&q=hello&offset=0&api_key=${KEY}&lang=de`,
		);
	});

	it("encodes the query", async () => {
		respondWithPage({
			pagination: { total_count: 4999, count: 50, offset: 100 },
		});

		await searchGifs({ query: "good morning & hi/bye", offset: 100 });

		expect(requestedUrl()).toBe(
			`https://api.giphy.com/v1/gifs/search?limit=50&rating=r&q=good%20morning%20%26%20hi%2Fbye&offset=100&api_key=${KEY}&lang=de`,
		);
	});

	it("also encodes what OkHttp encodes but encodeURIComponent keeps", async () => {
		respondWithPage({
			pagination: { total_count: 4999, count: 50, offset: 0 },
		});

		await searchGifs({ query: "omg! (hi) ~yay~ a*b it's", offset: 0 });

		expect(requestedUrl()).toBe(
			`https://api.giphy.com/v1/gifs/search?limit=50&rating=r&q=omg%21%20%28hi%29%20%7Eyay%7E%20a*b%20it%27s&offset=0&api_key=${KEY}&lang=de`,
		);
	});

	it.each([
		[{ total_count: 10_000, count: 50, offset: 4900 }, 4950],
		[{ total_count: 10_000, count: 50, offset: 4950 }, null],
	])("stops past the search maximum offset", async (pagination, next) => {
		respondWithPage({ pagination });

		const page = await searchGifs({
			query: "hello",
			offset: pagination.offset,
		});

		expect(page.nextOffset).toBe(next);
	});
});

describe("GIPHY request failures", () => {
	it("does not retry when GIPHY rate limits", async () => {
		respond({
			status: 429,
			body: { meta: { status: 429, msg: "Too many requests" } },
		});

		const error = await getTrendingGifs({ offset: 0 }).catch(
			(thrown: unknown) => thrown,
		);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).response?.status).toBe(429);
		expect((error as ApiError).retryable).toBe(false);
	});

	it("retries when GIPHY fails on its side", async () => {
		respond({ status: 503, body: {} });

		const error = await getTrendingGifs({ offset: 0 }).catch(
			(thrown: unknown) => thrown,
		);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).response?.status).toBe(503);
		expect((error as ApiError).retryable).toBe(true);
	});

	it("reports a blocked connection without the Grindr alerts", async () => {
		invokeMock.mockRejectedValueOnce({ kind: "NetworkBlocked" });

		const error = await getTrendingGifs({ offset: 0 }).catch(
			(thrown: unknown) => thrown,
		);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).message).not.toMatch(/grindr/i);
		expect(markRequestBlockedMock).not.toHaveBeenCalled();
	});

	it("reports a lost connection without naming Grindr", async () => {
		invokeMock.mockRejectedValueOnce({
			kind: "Connect",
			message: "dns error",
		});

		const error = await searchGifs({ query: "hi", offset: 0 }).catch(
			(thrown: unknown) => thrown,
		);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).kind).toBe("Connect");
		expect((error as ApiError).retryable).toBe(true);
		expect((error as ApiError).message).not.toMatch(/grindr/i);
	});

	it("leaves the Grindr session alone when the backend has none", async () => {
		invokeMock.mockRejectedValueOnce({ kind: "NotSignedIn" });

		await expect(getTrendingGifs({ offset: 0 })).rejects.toBeInstanceOf(
			ApiError,
		);
		expect(signOutIfSessionLostMock).not.toHaveBeenCalled();
	});
});

describe("receivedGiphySrc", () => {
	it("loads the renditions the official app sends", () => {
		const url = `${media}/200.gif`;
		expect(receivedGiphySrc(url)).toBe(url);
	});

	it("loads bare media.giphy.com links from pasted GIPHY links", () => {
		const url = "https://media.giphy.com/media/xT0xeChUR33EsYNNRK/200.gif";
		expect(receivedGiphySrc(url)).toBe(url);
	});

	it.each(["media0", "media1", "media2", "media3", "media4"])(
		"loads GIPHY's %s host",
		(host) => {
			const url = `https://${host}.giphy.com/media/xT0xeChUR33EsYNNRK/200.gif`;
			expect(receivedGiphySrc(url)).toBe(url);
		},
	);

	it.each([
		"https://d1abcdef.cloudfront.net/200.gif",
		"https://cdns.grindr.com/images/thumb/320x320/abc",
		"https://i.giphy.com/xT0xeChUR33EsYNNRK.gif",
		"https://media.giphy.com.example.org/media/x/200.gif",
		"https://media.giphy.com@d1abcdef.cloudfront.net/200.gif",
		"http://media.giphy.com/media/xT0xeChUR33EsYNNRK/200.gif",
		"not a url",
	])("refuses a sender-chosen URL off GIPHY's media hosts: %s", (url) => {
		expect(receivedGiphySrc(url)).toBeNull();
	});
});
