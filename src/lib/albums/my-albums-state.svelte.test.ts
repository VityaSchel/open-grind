import { afterEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({
	api: {
		getMyAlbums: vi.fn(),
		getAlbumStorageLimits: vi.fn(() => Promise.resolve({ maxAlbums: 10 })),
	},
}));

vi.mock("$lib/api/messaging/albums", () => api);

import { clearAccountCaches } from "$lib/api/account-caches";
import { demoMyAlbums } from "$lib/demo/mock/albums";
import { getMyAlbumsState } from "./my-albums-state.svelte";

const albums = demoMyAlbums().albums;

function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

afterEach(() => {
	clearAccountCaches();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("my albums state", () => {
	it("keeps the last list while a refresh is in flight", async () => {
		const state = getMyAlbumsState(1);
		api.getMyAlbums.mockResolvedValueOnce({ albums });
		await state.refresh();

		const next = deferred<{ albums: typeof albums }>();
		api.getMyAlbums.mockReturnValueOnce(next.promise);
		const refreshing = state.refresh();

		expect(state.albums).toEqual(albums);
		next.resolve({ albums: albums.slice(1) });
		await refreshing;
		expect(state.albums).toEqual(albums.slice(1));
	});

	it("keeps the list and stays quiet when a refresh fails", async () => {
		const state = getMyAlbumsState(1);
		api.getMyAlbums.mockResolvedValueOnce({ albums });
		await state.refresh();
		vi.spyOn(console, "error").mockImplementation(() => {});

		api.getMyAlbums.mockRejectedValueOnce(new Error("offline"));
		await state.refresh();

		expect(state.albums).toEqual(albums);
		expect(state.error).toBeNull();
	});

	it("reports a failed first load and clears it on reload", async () => {
		const state = getMyAlbumsState(1);
		const failure = new Error("offline");
		vi.spyOn(console, "error").mockImplementation(() => {});
		api.getMyAlbums.mockRejectedValueOnce(failure);
		await state.refresh();
		expect(state.error).toBe(failure);

		api.getMyAlbums.mockResolvedValueOnce({ albums });
		const reloading = state.reload();
		expect(state.error).toBeNull();
		await reloading;
		expect(state.albums).toEqual(albums);
	});

	it("shares one request between overlapping refreshes", async () => {
		const state = getMyAlbumsState(1);
		api.getMyAlbums.mockResolvedValueOnce({ albums });

		await Promise.all([state.refresh(), state.refresh()]);

		expect(api.getMyAlbums).toHaveBeenCalledOnce();
	});

	it("drops a removed album at once, and a load from before cannot bring it back", async () => {
		const state = getMyAlbumsState(1);
		api.getMyAlbums.mockResolvedValueOnce({ albums });
		await state.refresh();
		const [removed] = albums;
		if (removed === undefined) throw new Error("no demo albums");

		const stale = deferred<{ albums: typeof albums }>();
		api.getMyAlbums.mockReturnValueOnce(stale.promise);
		const staleLoad = state.refresh();
		state.remove(removed.albumId);
		expect(state.albums).toEqual(albums.slice(1));

		api.getMyAlbums.mockResolvedValueOnce({ albums: albums.slice(1) });
		const fresh = state.refresh();
		stale.resolve({ albums });
		await Promise.all([staleLoad, fresh]);

		expect(state.albums).toEqual(albums.slice(1));
		expect(api.getMyAlbums).toHaveBeenCalledTimes(3);
	});

	it("starts over for another account", async () => {
		api.getMyAlbums.mockResolvedValueOnce({ albums });
		await getMyAlbumsState(1).refresh();

		expect(getMyAlbumsState(2).albums).toBeNull();
	});
});
