// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({
	api: { getMyAlbums: vi.fn(), getAlbumStorageLimits: vi.fn() },
}));

vi.mock("$lib/api/messaging/albums", () => api);

import { clearAccountCaches } from "$lib/api/account-caches";
import { demoMyAlbums } from "$lib/demo/mock/albums";
import MyAlbumsPage from "./+page.svelte";

const ALBUM_TILE = '[data-slot="album-tile"]';

const albums = demoMyAlbums().albums;
const PAGE_PROPS = { data: { ourProfileId: 1 }, params: {} };

function opened(): HTMLElement {
	api.getMyAlbums.mockResolvedValueOnce({ albums });
	return render(MyAlbumsPage, { props: PAGE_PROPS }).container;
}

function tilesOf(container: HTMLElement): Promise<number> {
	return vi.waitFor(() => {
		const count = container.querySelectorAll(ALBUM_TILE).length;
		if (count === 0) throw new Error("albums still loading");
		return count;
	});
}

function addAlbum(): HTMLElement | null {
	return screen.queryByRole("link", { name: "Add album" });
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	clearAccountCaches();
});

describe("my albums page", () => {
	it("leads with the add cell below the album cap", async () => {
		api.getAlbumStorageLimits.mockResolvedValueOnce({
			maxAlbums: albums.length + 1,
		});

		const tiles = await tilesOf(opened());

		expect(tiles).toBe(albums.length);
		expect(addAlbum()).not.toBeNull();
	});

	it("drops the add cell at the album cap", async () => {
		api.getAlbumStorageLimits.mockResolvedValueOnce({
			maxAlbums: albums.length,
		});

		const tiles = await tilesOf(opened());

		expect(tiles).toBe(albums.length);
		expect(addAlbum()).toBeNull();
	});

	it("waits for the limits before showing any cell", async () => {
		let resolve: (value: { maxAlbums: number }) => void = () => {};
		api.getAlbumStorageLimits.mockReturnValueOnce(
			new Promise((settle) => {
				resolve = settle;
			}),
		);

		const container = opened();
		await new Promise((settle) => setTimeout(settle, 50));

		expect(container.querySelector(ALBUM_TILE)).toBeNull();
		expect(addAlbum()).toBeNull();

		resolve({ maxAlbums: albums.length });
		await tilesOf(container);
		expect(addAlbum()).toBeNull();
	});

	it("shows the last list at once when it opens again, refreshing behind it", async () => {
		api.getAlbumStorageLimits.mockResolvedValue({
			maxAlbums: albums.length + 1,
		});
		await tilesOf(opened());
		cleanup();
		const fetched = api.getMyAlbums.mock.calls.length;

		api.getMyAlbums.mockReturnValueOnce(new Promise(() => {}));
		const reopened = render(MyAlbumsPage, { props: PAGE_PROPS }).container;

		expect(reopened.querySelectorAll(ALBUM_TILE)).toHaveLength(
			albums.length,
		);
		expect(api.getMyAlbums).toHaveBeenCalledTimes(fetched + 1);
	});

	it("keeps the add cell when the limits fail to load", async () => {
		const failure = new Error("storage limits unavailable");
		api.getAlbumStorageLimits.mockRejectedValueOnce(failure);
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});

		const tiles = await tilesOf(opened());

		expect(tiles).toBe(albums.length);
		expect(addAlbum()).not.toBeNull();
		expect(logged).toHaveBeenCalledWith(failure);
	});
});
