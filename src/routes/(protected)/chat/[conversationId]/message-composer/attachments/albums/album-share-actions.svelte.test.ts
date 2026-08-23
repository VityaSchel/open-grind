import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	getAlbumShares: vi.fn(),
	shareAlbum: vi.fn(),
	unshareAlbum: vi.fn(),
}));

vi.mock("$lib/api/messaging/albums", () => api);

import { albumShares } from "$lib/chat/album-shares.svelte";
import { AlbumShareActions } from "./album-share-actions.svelte";

const PEER = 100001;

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

beforeEach(() => {
	albumShares.clear();
	for (const mock of Object.values(api)) mock.mockReset();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("AlbumShareActions", () => {
	it("resolves each album as soon as its own lookup answers", async () => {
		const first = deferred<{ profileIds: number[] }>();
		const second = deferred<{ profileIds: number[] }>();
		api.getAlbumShares.mockImplementation((albumId: number) =>
			albumId === 1 ? first.promise : second.promise,
		);
		const shares = new AlbumShareActions();

		const loading = shares.load({ albumIds: [1, 2] });
		expect(shares.isResolved(1)).toBe(false);

		first.resolve({ profileIds: [PEER] });
		await vi.waitFor(() => expect(shares.isResolved(1)).toBe(true));
		expect(albumShares.isSharedWith({ albumId: 1, profileId: PEER })).toBe(
			true,
		);
		expect(shares.isResolved(2)).toBe(false);

		second.resolve({ profileIds: [PEER + 1] });
		await loading;
		expect(shares.isResolved(2)).toBe(true);
		expect(albumShares.isSharedWith({ albumId: 2, profileId: PEER })).toBe(
			false,
		);
	});

	it("treats a failed lookup as resolved and not shared", async () => {
		api.getAlbumShares.mockRejectedValue(new Error("500"));
		const shares = new AlbumShareActions();

		await shares.load({ albumIds: [1] });

		expect(shares.isResolved(1)).toBe(true);
		expect(albumShares.isSharedWith({ albumId: 1, profileId: PEER })).toBe(
			false,
		);
	});

	it("ignores answers from a superseded load", async () => {
		const stale = deferred<{ profileIds: number[] }>();
		api.getAlbumShares.mockReturnValueOnce(stale.promise);
		api.getAlbumShares.mockResolvedValue({ profileIds: [] });
		const shares = new AlbumShareActions();

		const first = shares.load({ albumIds: [1] });
		await shares.load({ albumIds: [1] });
		stale.resolve({ profileIds: [PEER] });
		await first;

		expect(albumShares.isSharedWith({ albumId: 1, profileId: PEER })).toBe(
			false,
		);
	});

	it("updates optimistically and settles on success", async () => {
		api.shareAlbum.mockResolvedValue(undefined);
		const shares = new AlbumShareActions();

		const request = shares.update({
			albumId: 1,
			profileId: PEER,
			shared: true,
		});
		expect(albumShares.isSharedWith({ albumId: 1, profileId: PEER })).toBe(
			true,
		);

		await request;
		expect(api.shareAlbum).toHaveBeenCalledWith({
			albumId: 1,
			profileIds: [PEER],
		});
		expect(albumShares.isSharedWith({ albumId: 1, profileId: PEER })).toBe(
			true,
		);
	});

	it("rolls back and rethrows when the request fails", async () => {
		api.getAlbumShares.mockResolvedValue({ profileIds: [PEER] });
		api.unshareAlbum.mockRejectedValue(new Error("403"));
		const shares = new AlbumShareActions();
		await shares.load({ albumIds: [1] });

		const request = shares.update({
			albumId: 1,
			profileId: PEER,
			shared: false,
		});
		expect(albumShares.isSharedWith({ albumId: 1, profileId: PEER })).toBe(
			false,
		);

		await expect(request).rejects.toThrow("403");
		expect(api.unshareAlbum).toHaveBeenCalledWith({
			albumId: 1,
			profileIds: [PEER],
		});
		expect(albumShares.isSharedWith({ albumId: 1, profileId: PEER })).toBe(
			true,
		);
	});
});
