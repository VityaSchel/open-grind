import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));

import { getGifById, giphyIdFromLink } from "$lib/api/messaging/giphy-link";
import { toBase64 } from "$lib/util/base64";

const ID = "xT0xeChUR33EsYNNRK";

function gifHeader({ width, height }: { width: number; height: number }) {
	const bytes = new Uint8Array(32);
	bytes.set(new TextEncoder().encode("GIF89a"));
	const header = new DataView(bytes.buffer);
	header.setUint16(6, width, true);
	header.setUint16(8, height, true);
	return bytes;
}

const MEDIA = `https://media.giphy.com/media/${ID}`;
const PLACEHOLDER = gifHeader({ width: 356, height: 200 });
const SQUARE = gifHeader({ width: 200, height: 200 });

function respond({ status, body }: { status: number; body: Uint8Array }) {
	invokeMock.mockResolvedValueOnce(toBase64(encode({ status, body })));
}

function requestedUrls(): string[] {
	return invokeMock.mock.calls.map(
		([, args]) => (args as { url: string }).url,
	);
}

beforeEach(() => {
	invokeMock.mockReset();
});

describe("giphyIdFromLink", () => {
	it.each([
		`https://giphy.com/gifs/portlandia-season-2-episode-${ID}`,
		`https://giphy.com/gifs/${ID}`,
		`https://www.giphy.com/gifs/portlandia-${ID}/fullscreen`,
		`https://giphy.com/stickers/hello-${ID}`,
		`https://giphy.com/embed/${ID}`,
		`https://media.giphy.com/media/${ID}/giphy.gif`,
		`https://media2.giphy.com/media/v1.Y2lkPTA1Njg2OTFl/${ID}/200.gif`,
		`https://i.giphy.com/${ID}.webp`,
		`https://i.giphy.com/media/${ID}/giphy.gif`,
		`giphy.com/gifs/portlandia-${ID}`,
		`  https://giphy.com/gifs/${ID}?utm_source=share  `,
	])("reads the GIF id from %s", (link) => {
		expect(giphyIdFromLink(link)).toBe(ID);
	});

	it.each([
		"cat",
		"funny cat",
		"giphy",
		`https://example.com/gifs/${ID}`,
		`https://giphy.com/clips/portlandia-${ID}`,
		"https://giphy.com/gifs/",
		"https://giphy.com/gifs/not-a-valid_id!",
		`javascript://giphy.com/gifs/${ID}`,
	])("treats %s as search text", (text) => {
		expect(giphyIdFromLink(text)).toBeNull();
	});
});

describe("getGifById", () => {
	it("reads only the headers of the 200 px tall GIF and its still, and sends the bare renditions", async () => {
		respond({ status: 206, body: gifHeader({ width: 356, height: 200 }) });
		respond({ status: 206, body: gifHeader({ width: 356, height: 200 }) });

		const gif = await getGifById(ID);

		expect(invokeMock).toHaveBeenCalledTimes(2);
		expect(invokeMock).toHaveBeenCalledWith("fetch_external", {
			url: `${MEDIA}/200.gif`,
			range: "bytes=0-9",
		});
		expect(invokeMock).toHaveBeenCalledWith("fetch_external", {
			url: `${MEDIA}/200_s.gif`,
			range: "bytes=0-9",
		});
		expect(gif?.body).toEqual({
			id: ID,
			urlPath: `${MEDIA}/200.gif`,
			previewPath: `${MEDIA}/200.gif`,
			stillPath: `${MEDIA}/200_s.gif`,
			width: 356,
			height: 200,
			imageHash: `giphy/${ID}`,
		});
	});

	it("falls back to the 200 px wide GIF when GIPHY never made the 200 px tall one", async () => {
		respond({ status: 404, body: PLACEHOLDER });
		respond({ status: 206, body: SQUARE });
		respond({ status: 206, body: SQUARE });
		respond({ status: 206, body: SQUARE });

		const gif = await getGifById(ID);

		expect(requestedUrls()).toEqual([
			`${MEDIA}/200.gif`,
			`${MEDIA}/200_s.gif`,
			`${MEDIA}/200w.gif`,
			`${MEDIA}/200w_s.gif`,
		]);
		expect(gif?.body).toMatchObject({
			urlPath: `${MEDIA}/200w.gif`,
			stillPath: `${MEDIA}/200w_s.gif`,
			width: 200,
			height: 200,
		});
	});

	it("falls back to the original GIF last", async () => {
		respond({ status: 404, body: PLACEHOLDER });
		respond({ status: 404, body: PLACEHOLDER });
		respond({ status: 404, body: PLACEHOLDER });
		respond({ status: 404, body: PLACEHOLDER });
		respond({ status: 206, body: gifHeader({ width: 480, height: 480 }) });
		respond({ status: 206, body: gifHeader({ width: 480, height: 480 }) });

		const gif = await getGifById(ID);

		expect(gif?.body).toMatchObject({
			urlPath: `${MEDIA}/giphy.gif`,
			stillPath: `${MEDIA}/giphy_s.gif`,
			width: 480,
			height: 480,
		});
	});

	it("finds nothing behind a link GIPHY doesn't know, though its original answers with a placeholder", async () => {
		respond({ status: 404, body: PLACEHOLDER });
		respond({ status: 404, body: PLACEHOLDER });
		respond({ status: 404, body: PLACEHOLDER });
		respond({ status: 404, body: PLACEHOLDER });
		respond({ status: 206, body: gifHeader({ width: 480, height: 270 }) });
		respond({ status: 404, body: PLACEHOLDER });

		await expect(getGifById(ID)).resolves.toBeNull();
		expect(requestedUrls()).toHaveLength(6);
	});

	it("refuses an answer that isn't a GIF", async () => {
		respond({
			status: 200,
			body: new TextEncoder().encode("<html>Not found</html>"),
		});
		respond({ status: 206, body: SQUARE });

		await expect(getGifById(ID)).rejects.toThrow();
	});
});
