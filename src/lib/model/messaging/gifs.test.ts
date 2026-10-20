import { afterEach, describe, expect, it, vi } from "vitest";

import { giphyResponseSchema } from "$lib/model/messaging/gifs";

const portlandia =
	"https://media2.giphy.com/media/v1.Y2lkPTA1Njg2OTFlaTZubjdsdG9kcWZ1eXJhemIyMnV3Zmg4ZmMyeGM2MHkycDY0OWYwOCZlcD12MV9naWZzX3RyZW5kaW5nJmN0PWc/xT0xeChUR33EsYNNRK";
const iLove =
	"https://media0.giphy.com/media/v1.Y2lkPTA1Njg2OTFlaTZubjdsdG9kcWZ1eXJhemIyMnV3Zmg4ZmMyeGM2MHkycDY0OWYwOCZlcD12MV9naWZzX3RyZW5kaW5nJmN0PWc/QbkNr0NcyPpKM";

function trendingCapture() {
	return {
		data: [
			{
				type: "gif",
				id: "xT0xeChUR33EsYNNRK",
				url: "https://giphy.com/gifs/portlandia-season-2-episode-xT0xeChUR33EsYNNRK",
				slug: "portlandia-season-2-episode-xT0xeChUR33EsYNNRK",
				title: "Season 2 No GIF by Portlandia",
				alt_text: "",
				rating: "g",
				username: "portlandia",
				images: {
					original: {
						height: "270",
						width: "480",
						size: "1124683",
						url: `${portlandia}/giphy.gif`,
						mp4_size: "153841",
						mp4: `${portlandia}/giphy.mp4`,
						webp_size: "204846",
						webp: `${portlandia}/giphy.webp`,
						frames: "24",
						hash: "d2c04acd19da65a3a698774c701c9c73",
					},
					fixed_height: {
						height: "200",
						width: "356",
						size: "500733",
						url: `${portlandia}/200.gif`,
						mp4_size: "100928",
						mp4: `${portlandia}/200.mp4`,
						webp_size: "148732",
						webp: `${portlandia}/200.webp`,
					},
					fixed_height_still: {
						height: "200",
						width: "356",
						size: "20754",
						url: `${portlandia}/200_s.gif`,
					},
					fixed_width_downsampled: {
						height: "113",
						width: "200",
						size: "61107",
						url: `${portlandia}/200w_d.gif`,
						webp_size: "30926",
						webp: `${portlandia}/200w_d.webp`,
					},
					looping: {},
				},
			},
			{
				type: "gif",
				id: "QbkNr0NcyPpKM",
				url: "https://giphy.com/gifs/i-love-QbkNr0NcyPpKM",
				slug: "i-love-QbkNr0NcyPpKM",
				title: "i love GIF",
				alt_text: "",
				rating: "g",
				username: "",
				images: {
					fixed_height: {
						height: "200",
						width: "152",
						size: "258898",
						url: `${iLove}/200.gif`,
						mp4_size: "44459",
						mp4: `${iLove}/200.mp4`,
						webp_size: "180396",
						webp: `${iLove}/200.webp`,
					},
					fixed_height_still: {
						height: "200",
						width: "152",
						size: "13645",
						url: `${iLove}/200_s.gif`,
					},
					fixed_width_downsampled: {
						height: "264",
						width: "200",
						size: "122020",
						url: `${iLove}/200w_d.gif`,
						webp_size: "93732",
						webp: `${iLove}/200w_d.webp`,
					},
					looping: {},
				},
			},
		],
		pagination: { total_count: 130, count: 50, offset: 0 },
		meta: {
			status: 200,
			msg: "OK",
			response_id: "i6nn7ltodqfuyrazb22uwfh8fc2xc60y2p649f08",
		},
	};
}

type CapturedGif = ReturnType<typeof trendingCapture>["data"][0];

function withGif(edit: (gif: CapturedGif) => void) {
	const capture = trendingCapture();
	const [first] = capture.data;
	if (first === undefined) throw new Error("capture has no GIFs");
	edit(first);
	return capture;
}

function keptIds(response: unknown): string[] {
	return giphyResponseSchema.parse(response).data.map((gif) => gif.id);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("giphyResponseSchema", () => {
	it("parses a captured trending page with string dimensions as numbers", () => {
		const parsed = giphyResponseSchema.parse(trendingCapture());

		expect(parsed.pagination).toEqual({
			total_count: 130,
			count: 50,
			offset: 0,
		});
		expect(parsed.meta).toEqual({ status: 200, msg: "OK" });
		expect(parsed.data).toHaveLength(2);
		expect(parsed.data[0]).toEqual({
			id: "xT0xeChUR33EsYNNRK",
			title: "Season 2 No GIF by Portlandia",
			alt_text: "",
			images: {
				fixed_width_downsampled: {
					url: `${portlandia}/200w_d.gif`,
					webp: `${portlandia}/200w_d.webp`,
					width: 200,
					height: 113,
				},
				fixed_height: {
					url: `${portlandia}/200.gif`,
					webp: `${portlandia}/200.webp`,
					width: 356,
					height: 200,
				},
				fixed_height_still: {
					url: `${portlandia}/200_s.gif`,
					width: 356,
					height: 200,
				},
			},
		});
	});

	it("parses a page without pagination or meta", () => {
		const { data } = trendingCapture();

		expect(giphyResponseSchema.parse({ data }).pagination).toBeUndefined();
	});

	it("keeps a GIF whose tile rendition has no WebP", () => {
		const capture = withGif((gif) => {
			const { url, width, height } = gif.images.fixed_width_downsampled;
			gif.images.fixed_width_downsampled = {
				url,
				width,
				height,
			} as typeof gif.images.fixed_width_downsampled;
		});

		expect(keptIds(capture)).toEqual([
			"xT0xeChUR33EsYNNRK",
			"QbkNr0NcyPpKM",
		]);
	});

	it.each([
		[
			"a dimension sent as a number",
			(gif: CapturedGif) => {
				Object.assign(gif.images.fixed_height, { width: 356 });
			},
		],
		[
			"a zero dimension",
			(gif: CapturedGif) => {
				gif.images.fixed_height.height = "0";
			},
		],
		[
			"a URL on another host",
			(gif: CapturedGif) => {
				gif.images.fixed_height.url =
					"https://media.giphy.com.example.org/media/x/200.gif";
			},
		],
		[
			"a URL over plain HTTP",
			(gif: CapturedGif) => {
				gif.images.fixed_height_still.url = `${portlandia.replace("https:", "http:")}/200_s.gif`;
			},
		],
		[
			"a tile rendition with neither URL nor WebP",
			(gif: CapturedGif) => {
				gif.images.fixed_width_downsampled = {
					width: "200",
					height: "113",
				} as typeof gif.images.fixed_width_downsampled;
			},
		],
		[
			"no still rendition",
			(gif: CapturedGif) => {
				Reflect.deleteProperty(gif.images, "fixed_height_still");
			},
		],
		[
			"a blank id",
			(gif: CapturedGif) => {
				gif.id = "  ";
			},
		],
	])("drops only the GIF with %s", (_, edit) => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(keptIds(withGif(edit))).toEqual(["QbkNr0NcyPpKM"]);
	});
});
