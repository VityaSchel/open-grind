import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { getMyAlbums, shareAlbum } from "$lib/api/messaging/albums";
import { demoMyAlbums } from "$lib/demo/mock/albums";

const assertOk = vi.fn();
const jsonParsed = vi.fn();

beforeEach(() => {
	assertOk.mockReset();
	jsonParsed.mockReset();
	fetchRestMock.mockReset();
	fetchRestMock.mockResolvedValue({ assertOk, jsonParsed });
});

describe("albums API wrappers", () => {
	it("shares an album with every listed profile and asserts the status", async () => {
		await shareAlbum({ albumId: 900, profileIds: [11, 22] });

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/albums/900/shares", {
			method: "POST",
			body: {
				profiles: [
					{ profileId: 11, expirationType: "INDEFINITE" },
					{ profileId: 22, expirationType: "INDEFINITE" },
				],
			},
		});
		expect(assertOk).toHaveBeenCalledOnce();
	});

	it("shares with a caller-supplied expiration", async () => {
		await shareAlbum({
			albumId: 901,
			profileIds: [11],
			expirationType: "ONCE",
		});

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/albums/901/shares", {
			method: "POST",
			body: { profiles: [{ profileId: 11, expirationType: "ONCE" }] },
		});
	});

	it("propagates a failed share instead of reporting success", async () => {
		assertOk.mockImplementation(() => {
			throw new Error("403");
		});

		await expect(
			shareAlbum({ albumId: 900, profileIds: [11] }),
		).rejects.toThrow("403");
	});

	it("parses my albums off the documented response shape", async () => {
		jsonParsed.mockImplementation(
			(schema: { parse: (v: unknown) => unknown }) =>
				schema.parse(demoMyAlbums()),
		);

		const { albums } = await getMyAlbums();

		expect(fetchRestMock).toHaveBeenCalledWith("/v1/albums");
		expect(albums.length).toBeGreaterThan(0);
	});
});
