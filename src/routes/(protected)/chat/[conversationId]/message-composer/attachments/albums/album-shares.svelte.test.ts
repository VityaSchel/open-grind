import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	getAlbumShares: vi.fn(),
	shareAlbum: vi.fn(),
	unshareAlbum: vi.fn(),
}));

vi.mock("$lib/api/messaging/albums", () => api);

import { AlbumShares } from "./album-shares.svelte";

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
	for (const mock of Object.values(api)) mock.mockReset();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("AlbumShares", () => {
	it("resolves each album as soon as its own lookup answers", async () => {
		const first = deferred<{ profileIds: number[] }>();
		const second = deferred<{ profileIds: number[] }>();
		api.getAlbumShares.mockImplementation((albumId: number) =>
			albumId === 1 ? first.promise : second.promise,
		);
		const shares = new AlbumShares();

		const loading = shares.load({ albumIds: [1, 2], profileId: PEER });
		expect(shares.isResolved(1)).toBe(false);

		first.resolve({ profileIds: [PEER] });
		await vi.waitFor(() => expect(shares.isResolved(1)).toBe(true));
		expect(shares.has(1)).toBe(true);
		expect(shares.isResolved(2)).toBe(false);

		second.resolve({ profileIds: [PEER + 1] });
		await loading;
		expect(shares.isResolved(2)).toBe(true);
		expect(shares.has(2)).toBe(false);
	});

	it("treats a failed lookup as resolved and not shared", async () => {
		api.getAlbumShares.mockRejectedValue(new Error("500"));
		const shares = new AlbumShares();

		await shares.load({ albumIds: [1], profileId: PEER });

		expect(shares.isResolved(1)).toBe(true);
		expect(shares.has(1)).toBe(false);
	});

	it("ignores answers from a superseded load", async () => {
		const stale = deferred<{ profileIds: number[] }>();
		api.getAlbumShares.mockReturnValueOnce(stale.promise);
		api.getAlbumShares.mockResolvedValue({ profileIds: [] });
		const shares = new AlbumShares();

		const first = shares.load({ albumIds: [1], profileId: PEER });
		await shares.load({ albumIds: [1], profileId: PEER + 1 });
		stale.resolve({ profileIds: [PEER] });
		await first;

		expect(shares.has(1)).toBe(false);
	});

	it("updates optimistically and settles on success", async () => {
		api.shareAlbum.mockResolvedValue(undefined);
		const shares = new AlbumShares();

		const request = shares.update({
			albumId: 1,
			profileId: PEER,
			shared: true,
		});
		expect(shares.has(1)).toBe(true);

		await request;
		expect(api.shareAlbum).toHaveBeenCalledWith({
			albumId: 1,
			profileIds: [PEER],
		});
		expect(shares.has(1)).toBe(true);
	});

	it("rolls back and rethrows when the request fails", async () => {
		api.getAlbumShares.mockResolvedValue({ profileIds: [PEER] });
		api.unshareAlbum.mockRejectedValue(new Error("403"));
		const shares = new AlbumShares();
		await shares.load({ albumIds: [1], profileId: PEER });

		const request = shares.update({
			albumId: 1,
			profileId: PEER,
			shared: false,
		});
		expect(shares.has(1)).toBe(false);

		await expect(request).rejects.toThrow("403");
		expect(api.unshareAlbum).toHaveBeenCalledWith({
			albumId: 1,
			profileIds: [PEER],
		});
		expect(shares.has(1)).toBe(true);
	});
});
