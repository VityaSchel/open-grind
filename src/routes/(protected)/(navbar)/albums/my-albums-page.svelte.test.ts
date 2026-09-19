// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { api, limits } = vi.hoisted(() => ({
	api: { getMyAlbums: vi.fn() },
	limits: { storageLimits: vi.fn() },
}));

vi.mock("$lib/api/messaging/albums", () => api);
vi.mock("./album-uploads/album-uploads.svelte", () => ({ uploads: limits }));

import { demoMyAlbums } from "$lib/demo/mock/albums";
import MyAlbumsPage from "./+page.svelte";

const ALBUM_TILE = '[data-slot="album-tile"]';

const albums = demoMyAlbums().albums;

function opened(): HTMLElement {
	api.getMyAlbums.mockResolvedValueOnce({ albums });
	return render(MyAlbumsPage).container;
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
});

describe("my albums page", () => {
	it("leads with the add cell below the album cap", async () => {
		limits.storageLimits.mockResolvedValueOnce({
			maxAlbums: albums.length + 1,
		});

		const tiles = await tilesOf(opened());

		expect(tiles).toBe(albums.length);
		expect(addAlbum()).not.toBeNull();
	});

	it("drops the add cell at the album cap", async () => {
		limits.storageLimits.mockResolvedValueOnce({
			maxAlbums: albums.length,
		});

		const tiles = await tilesOf(opened());

		expect(tiles).toBe(albums.length);
		expect(addAlbum()).toBeNull();
	});

	it("waits for the limits before showing any cell", async () => {
		let resolve: (value: { maxAlbums: number }) => void = () => {};
		limits.storageLimits.mockReturnValueOnce(
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

	it("keeps the add cell when the limits fail to load", async () => {
		const failure = new Error("storage limits unavailable");
		limits.storageLimits.mockRejectedValueOnce(failure);
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});

		const tiles = await tilesOf(opened());

		expect(tiles).toBe(albums.length);
		expect(addAlbum()).not.toBeNull();
		expect(logged).toHaveBeenCalledWith(failure);
	});
});
