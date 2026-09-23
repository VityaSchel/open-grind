// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	getMyAlbums: vi.fn(),
	getAlbumStorageLimits: vi.fn(() => Promise.resolve({ maxAlbums: 10 })),
}));

vi.mock("$lib/api/messaging/albums", () => api);

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	albumProcessingPlaceholderUrl,
	demoMyAlbums,
} from "$lib/demo/mock/albums";
import type { MyAlbum } from "$lib/model/messaging/albums";
import AlbumsLink from "./AlbumsLink.svelte";

const MEDIA = '[data-slot="item-media"]';

function withEveryItemProcessing(album: MyAlbum): MyAlbum {
	return {
		...album,
		content: album.content.map((item) => ({
			...item,
			contentType: "video/mp4",
			coverUrl: albumProcessingPlaceholderUrl,
			statusId: 3,
			thumbUrl: albumProcessingPlaceholderUrl,
			url: albumProcessingPlaceholderUrl,
			processing: true,
		})),
	};
}

async function settledMediaOf(albums: MyAlbum[]): Promise<Element> {
	clearAccountCaches();
	api.getMyAlbums.mockResolvedValueOnce({ albums });
	const { container } = render(AlbumsLink, { props: { ourProfileId: 1 } });
	return vi.waitFor(() => {
		const media = container.querySelector(MEDIA);
		if (media === null || media.querySelector('[data-slot="skeleton"]')) {
			throw new Error("albums still loading");
		}
		return media;
	});
}

afterEach(() => cleanup());

describe("albums link", () => {
	it("shows the no-albums icon while every item is processing", async () => {
		const albums = demoMyAlbums().albums.map(withEveryItemProcessing);

		const processing = await settledMediaOf(albums);
		const empty = await settledMediaOf([]);

		expect(empty.querySelector("svg")).not.toBeNull();
		expect(processing.outerHTML).toBe(empty.outerHTML);
	});

	it("shows the first ready item as the cover", async () => {
		const [first, second] = demoMyAlbums().albums;
		if (first === undefined || second === undefined) {
			throw new Error("no demo albums");
		}

		const media = await settledMediaOf([
			withEveryItemProcessing(first),
			second,
		]);

		expect(media.querySelector("img")?.getAttribute("src")).toContain(
			second.content[0]?.thumbUrl ?? "missing",
		);
	});
});
