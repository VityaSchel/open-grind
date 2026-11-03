import { describe, expect, it } from "vitest";

import { demoRoute } from "$lib/demo";
import {
	albumContentProcessingResponseSchema,
	albumNameResponseSchema,
	albumSharesResponseSchema,
	albumStorageLimitsSchema,
	myAlbumsResponseSchema,
} from "$lib/model/messaging/albums";

const route = ({
	path,
	method = "GET",
	body,
}: {
	path: string;
	method?: string;
	body?: unknown;
}) => demoRoute({ path, method, body }).body;

describe("demo albums", () => {
	it("my albums cover the states the composer tab renders", () => {
		const { albums } = myAlbumsResponseSchema.parse(
			route({ path: "/v1/albums" }),
		);

		expect(albums.length).toBeGreaterThan(0);
		expect(albums.some((album) => album.albumName === null)).toBe(true);
		expect(albums.some((album) => !album.isShareable)).toBe(true);
		expect(
			albums.some((album) =>
				album.content.some((item) =>
					item.contentType.startsWith("video/"),
				),
			),
		).toBe(true);
	});

	it("records an album share against the album it names", () => {
		const albumId = myAlbumsResponseSchema.parse(
			route({ path: "/v1/albums" }),
		).albums[0]!.albumId;
		const sharedCountOf = (id: number) =>
			myAlbumsResponseSchema
				.parse(route({ path: "/v1/albums" }))
				.albums.find((album) => album.albumId === id)!.sharedCount;
		const before = sharedCountOf(albumId);
		const neighborBefore = sharedCountOf(albumId + 1);

		expect(
			demoRoute({
				path: `/v4/albums/${albumId}/shares`,
				method: "POST",
				body: {
					profiles: [{ profileId: 1, expirationType: "INDEFINITE" }],
				},
			}).status,
		).toBe(200);

		expect(sharedCountOf(albumId)).toBe(before + 1);
		expect(sharedCountOf(albumId + 1)).toBe(neighborBefore);
	});

	it("lists the profiles an album is shared with, then forgets an unshare", () => {
		const albumId = 902;
		const sharesOf = (id: number) =>
			albumSharesResponseSchema.parse(
				route({ path: `/v1/albums/${id}/shares` }),
			).profileIds;

		expect(sharesOf(albumId)).not.toContain(7);

		route({
			path: `/v4/albums/${albumId}/shares`,
			method: "POST",
			body: {
				profiles: [{ profileId: 7, expirationType: "INDEFINITE" }],
			},
		});
		expect(sharesOf(albumId)).toContain(7);

		expect(
			demoRoute({
				path: `/v1/albums/${albumId}/unshares`,
				method: "PUT",
				body: { profiles: [{ profileId: 7, shareId: "share-1" }] },
			}).status,
		).toBe(200);
		expect(sharesOf(albumId)).not.toContain(7);
	});

	it("rejects an album unshare whose body is not the documented shape", () => {
		expect(() =>
			demoRoute({
				path: "/v1/albums/900/unshares",
				method: "PUT",
				body: { profileIds: [1] },
			}),
		).toThrow();
	});

	it("rejects an album share whose body is not the documented shape", () => {
		expect(() =>
			demoRoute({
				path: "/v4/albums/900/shares",
				method: "POST",
				body: { profileIds: [1] },
			}),
		).toThrow();
	});

	it("creates named empty albums until the storage limit, then answers 402", () => {
		const { maxAlbums } = albumStorageLimitsSchema.parse(
			route({ path: "/v1/albums/storage" }),
		);
		const albumsNow = () =>
			myAlbumsResponseSchema.parse(route({ path: "/v1/albums" })).albums;
		const creatable = maxAlbums - albumsNow().length;
		expect(creatable).toBeGreaterThan(0);

		for (let created = 0; created < creatable; created++) {
			const { albumId } = albumNameResponseSchema.parse(
				route({
					path: "/v2/albums",
					method: "POST",
					body: { albumName: `New ${created}` },
				}),
			);
			const album = albumsNow().find((item) => item.albumId === albumId);
			expect(album?.albumName).toBe(`New ${created}`);
			expect(album?.content).toEqual([]);
		}

		const refused = demoRoute({
			path: "/v2/albums",
			method: "POST",
			body: { albumName: "One too many" },
		});
		expect(refused.status).toBe(402);
		expect(albumsNow()).toHaveLength(maxAlbums);
	});

	it("rejects an album creation whose body is not the documented shape", () => {
		expect(() =>
			demoRoute({
				path: "/v2/albums",
				method: "POST",
				body: { name: "x" },
			}),
		).toThrow();
	});

	it("reports album content processing only for items the album holds", () => {
		const [album] = myAlbumsResponseSchema.parse(
			route({ path: "/v1/albums" }),
		).albums;
		const item = album?.content[0];
		if (album === undefined || item === undefined)
			throw new Error("no demo album content");

		const status = albumContentProcessingResponseSchema.parse(
			route({
				path: `/v1/albums/${album.albumId}/content/${item.contentId}/processing`,
			}),
		);
		expect(status.processing).toBe(item.processing);
		expect(
			demoRoute({
				path: `/v1/albums/${album.albumId}/content/1/processing`,
				method: "GET",
				body: undefined,
			}).status,
		).toBe(404);
	});
});
