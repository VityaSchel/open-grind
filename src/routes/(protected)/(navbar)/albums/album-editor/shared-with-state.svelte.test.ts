import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAlbumSharesMock, shareAlbumMock, unshareAlbumMock } = vi.hoisted(
	() => ({
		getAlbumSharesMock: vi.fn(),
		shareAlbumMock: vi.fn(),
		unshareAlbumMock: vi.fn(),
	}),
);

vi.mock("$lib/api/messaging/albums", () => ({
	getAlbumShares: getAlbumSharesMock,
	shareAlbum: shareAlbumMock,
	unshareAlbum: unshareAlbumMock,
}));

import { albumShares } from "$lib/chat/album-shares.svelte";
import { AlbumSharedWith } from "./shared-with-state.svelte";

const ALBUM_ID = 903;

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

beforeEach(() => {
	getAlbumSharesMock.mockReset();
	shareAlbumMock.mockReset().mockResolvedValue(undefined);
	unshareAlbumMock.mockReset().mockResolvedValue(undefined);
	albumShares.clear();
});

describe("AlbumSharedWith", () => {
	it("shows the album's own count until the list arrives", async () => {
		getAlbumSharesMock.mockResolvedValue({ profileIds: [11, 22, 33] });
		const shares = new AlbumSharedWith({
			albumId: ALBUM_ID,
			sharedCount: 13,
		});

		expect(shares.count, "seeded from the album payload").toBe(13);
		await shares.load();
		expect(shares.count, "the fetched list wins").toBe(3);
	});

	it("reports an empty list even when the seed disagreed", async () => {
		getAlbumSharesMock.mockResolvedValue({ profileIds: [] });
		const shares = new AlbumSharedWith({
			albumId: ALBUM_ID,
			sharedCount: 4,
		});

		await shares.load();
		expect(shares.count).toBe(0);
	});

	it("counts everyone the album is shared with", async () => {
		getAlbumSharesMock.mockResolvedValue({ profileIds: [11, 22, 33] });
		const shares = new AlbumSharedWith({
			albumId: ALBUM_ID,
			sharedCount: 0,
		});

		expect(shares.count).toBe(0);
		await expect(shares.load()).resolves.toEqual([11, 22, 33]);
		expect(shares.count).toBe(3);
		expect(
			albumShares.isSharedWith({ albumId: ALBUM_ID, profileId: 22 }),
		).toBe(true);
	});

	it("drops one profile on unshare and puts it back on re-share", async () => {
		getAlbumSharesMock.mockResolvedValue({ profileIds: [11, 22] });
		const shares = new AlbumSharedWith({
			albumId: ALBUM_ID,
			sharedCount: 0,
		});
		await shares.load();

		await shares.setShared({ profileId: 22, shared: false });
		expect(unshareAlbumMock).toHaveBeenCalledWith({
			albumId: ALBUM_ID,
			profileIds: [22],
		});
		expect(shares.count).toBe(1);
		expect(
			albumShares.isSharedWith({ albumId: ALBUM_ID, profileId: 22 }),
		).toBe(false);

		await shares.setShared({ profileId: 22, shared: true });
		expect(shareAlbumMock).toHaveBeenCalledWith({
			albumId: ALBUM_ID,
			profileIds: [22],
		});
		expect(shares.count).toBe(2);
	});

	it("leaves the count untouched when the request fails", async () => {
		getAlbumSharesMock.mockResolvedValue({ profileIds: [11] });
		const shares = new AlbumSharedWith({
			albumId: ALBUM_ID,
			sharedCount: 0,
		});
		await shares.load();
		unshareAlbumMock.mockRejectedValue(new Error("403"));

		await expect(
			shares.setShared({ profileId: 11, shared: false }),
		).rejects.toThrow("403");
		expect(shares.count).toBe(1);
	});

	it("ignores a load that resolves after an unshare", async () => {
		const slow = deferred<{ profileIds: number[] }>();
		getAlbumSharesMock.mockReturnValueOnce(slow.promise);
		const shares = new AlbumSharedWith({
			albumId: ALBUM_ID,
			sharedCount: 0,
		});
		const loading = shares.load();

		getAlbumSharesMock.mockResolvedValue({ profileIds: [11, 22] });
		await shares.load();
		await shares.setShared({ profileId: 22, shared: false });

		slow.resolve({ profileIds: [11, 22] });
		await loading;

		expect(shares.count, "the stale answer did not resurrect 22").toBe(1);
	});
});
