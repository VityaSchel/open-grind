import { describe, expect, it } from "vitest";

import { demoGiphyMediaUrl, demoRoute } from "$lib/demo";
import { demoGiphyMessageBody } from "$lib/demo/mock/giphy";
import { giphyResponseSchema } from "$lib/model/messaging/gifs";

const key = "zf7gBZ531pHaTJN3ne0jDdAepsNreB2X";

function get(path: string) {
	return demoRoute({ path, method: "GET", body: undefined });
}

function trending(offset: number) {
	const offsetParam = offset === 0 ? "" : `&offset=${offset}`;
	return giphyResponseSchema.parse(
		get(
			`api.giphy.com/v1/gifs/trending?limit=50&rating=r${offsetParam}&api_key=${key}`,
		).body,
	);
}

function search({ query, offset = 0 }: { query: string; offset?: number }) {
	return giphyResponseSchema.parse(
		get(
			`api.giphy.com/v1/gifs/search?limit=50&rating=r&q=${encodeURIComponent(query)}&offset=${offset}&api_key=${key}&lang=en`,
		).body,
	);
}

describe("demo GIPHY", () => {
	it("pages trending GIFs to an end after four pages", () => {
		const pages = [0, 50, 100, 150, 200].map(trending);

		expect(pages.map(({ pagination }) => pagination)).toEqual([
			{ total_count: 172, count: 50, offset: 0 },
			{ total_count: 172, count: 50, offset: 50 },
			{ total_count: 172, count: 50, offset: 100 },
			{ total_count: 172, count: 22, offset: 150 },
			{ total_count: 172, count: 0, offset: 200 },
		]);
		for (const { data, pagination } of pages)
			expect(data).toHaveLength(pagination?.count ?? -1);
		const ids = pages.flatMap(({ data }) => data.map(({ id }) => id));
		expect(new Set(ids).size).toBe(172);
	});

	it("answers a search with GIFs about the query", () => {
		const first = search({ query: "good morning" });
		const second = search({ query: "good morning", offset: 50 });

		expect(first.data).toHaveLength(50);
		expect(first.data[0]?.title).toBe("Good Morning GIF 1");
		expect(first.pagination?.total_count).toBeGreaterThan(50);
		expect(second.data[0]?.title).toBe("Good Morning GIF 51");
	});

	it("finds nothing for the empty-result query", () => {
		expect(search({ query: "zzzz" })).toMatchObject({
			data: [],
			pagination: { total_count: 0, count: 0, offset: 0 },
		});
	});

	it("draws each rendition at the size the fixture states", () => {
		const [gif] = trending(0).data;
		if (gif === undefined) throw new Error("no trending GIF");
		const { fixed_width_downsampled, fixed_height, fixed_height_still } =
			gif.images;

		for (const [url, rendition] of [
			[fixed_width_downsampled.webp, fixed_width_downsampled],
			[fixed_height.url, fixed_height],
			[fixed_height_still.url, fixed_height_still],
		] as const) {
			const svg = decodeURIComponent(demoGiphyMediaUrl(url ?? ""));
			expect(svg).toMatch(/^data:image\/svg\+xml,<svg /);
			expect(svg).toContain(`width="${rendition.width}"`);
			expect(svg).toContain(`height="${rendition.height}"`);
		}
	});

	it("puts GIFs in demo chats whose media matches the size they were sent with", () => {
		const body = demoGiphyMessageBody("message-100001-3");
		const svg = decodeURIComponent(demoGiphyMediaUrl(body.urlPath));

		expect(svg).toContain(`width="${body.width}" height="${body.height}"`);
	});

	it("refuses routes GIPHY does not serve", () => {
		expect(get("api.giphy.com/v1/stickers/trending").status).toBe(404);
	});
});
