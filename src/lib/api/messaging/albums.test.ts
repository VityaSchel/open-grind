import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock, invokeMock } = vi.hoisted(() => ({
	fetchRestMock: vi.fn(),
	invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { ApiError } from "$lib/api/api-error";
import {
	albumMediaErrorMessage,
	getAlbumContentProcessing,
	getAlbumShares,
	getAlbumStorageLimits,
	getMyAlbums,
	shareAlbum,
	unshareAlbum,
	uploadAlbumContent,
} from "$lib/api/messaging/albums";
import {
	albumProcessingPlaceholderUrl,
	demoAlbumContent,
	demoAlbumContentProcessing,
	demoAlbumShares,
	demoMyAlbums,
	demoUploadAlbumContent,
} from "$lib/demo/mock/albums";
import { toBase64 } from "$lib/util/base64";
import type { AlbumUnshareRequest } from "$lib/model/messaging/albums";
import type { PickedMedia } from "$lib/platform/media-picker";

const assertOk = vi.fn();
const jsonParsed = vi.fn();

beforeEach(() => {
	assertOk.mockReset();
	jsonParsed.mockReset();
	fetchRestMock.mockReset();
	invokeMock.mockReset();
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

	it("unshares an album from every listed profile and asserts the status", async () => {
		await unshareAlbum({ albumId: 900, profileIds: [11, 22] });

		expect(fetchRestMock).toHaveBeenCalledWith("/v1/albums/900/unshares", {
			method: "PUT",
			body: {
				profiles: [
					{ profileId: 11, shareId: expect.any(String) },
					{ profileId: 22, shareId: expect.any(String) },
				],
			},
		});
		expect(assertOk).toHaveBeenCalledOnce();
	});

	it("gives every unshared profile its own share id", async () => {
		await unshareAlbum({ albumId: 900, profileIds: [11, 22] });

		const [, options] = fetchRestMock.mock.calls[0] as [
			string,
			{ body: AlbumUnshareRequest },
		];
		const [first, second] = options.body.profiles;
		expect(first?.shareId).not.toBe(second?.shareId);
	});

	it("propagates a failed unshare instead of reporting success", async () => {
		assertOk.mockImplementation(() => {
			throw new Error("403");
		});

		await expect(
			unshareAlbum({ albumId: 900, profileIds: [11] }),
		).rejects.toThrow("403");
	});

	it("reads the profiles an album is shared with", async () => {
		jsonParsed.mockImplementation(
			(schema: { parse: (v: unknown) => unknown }) =>
				schema.parse({ profileIds: demoAlbumShares(901) }),
		);

		const { profileIds } = await getAlbumShares(901);

		expect(fetchRestMock).toHaveBeenCalledWith("/v1/albums/901/shares");
		expect(profileIds).toEqual(demoAlbumShares(901));
		expect(profileIds.length).toBeGreaterThan(0);
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

	it("reads whether an uploaded album item is still processing", async () => {
		jsonParsed.mockImplementation(
			(schema: { parse: (v: unknown) => unknown }) =>
				schema.parse({ processing: true }),
		);

		const { processing } = await getAlbumContentProcessing({
			albumId: 900,
			contentId: 90001,
		});

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v1/albums/900/content/90001/processing",
		);
		expect(processing).toBe(true);
	});

	it("rejects a processing status without the processing flag", async () => {
		jsonParsed.mockImplementation(
			(schema: { parse: (v: unknown) => unknown }) => schema.parse({}),
		);

		await expect(
			getAlbumContentProcessing({ albumId: 900, contentId: 90001 }),
		).rejects.toThrow();
	});

	it("parses the storage limits a free account receives", async () => {
		jsonParsed.mockImplementation(
			(schema: { parse: (v: unknown) => unknown }) =>
				schema.parse({
					maxAlbums: 1,
					maxContentItemsPerAlbum: 10,
					maxContentSize: 125829120,
					maxContentSizeHumanReadable: "120.00 MB",
					maxShareableAlbums: 1,
					maxShares: 5000,
					maxVideoLength: 15000,
					maxVideosPerAlbum: 1,
					maxViewableAlbums: 5,
					maxViewableVideos: 1,
					minVideoLength: 1,
					subscriptionType: "FreeAlbums",
				}),
		);

		const limits = await getAlbumStorageLimits();

		expect(fetchRestMock).toHaveBeenCalledWith("/v1/albums/storage");
		expect(limits.maxContentSize).toBe(120 * 1024 * 1024);
		expect(limits.maxVideoLength).toBe(15000);
	});
});

const uploadLimits = {
	maxContentSize: 125829120,
	maxContentSizeHumanReadable: "120.00 MB",
};

const pickedPhoto = {
	source: "desktop",
	key: "album-photo-1",
	mimeType: "image/png",
	path: "/tmp/photo.png",
} satisfies PickedMedia;

const pickedVideo = {
	source: "desktop",
	key: "album-video-1",
	mimeType: "video/quicktime",
	path: "/tmp/clip.mov",
} satisfies PickedMedia;

const photoInspection = { kind: "photo", size: 4096 } as const;
const videoInspection = {
	kind: "video",
	size: 8_000_000,
	width: 1080,
	height: 1920,
} as const;

const uploadSha =
	"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

function encodedUploadResponse(body: unknown) {
	return toBase64(
		encode({
			status: 200,
			body: new TextEncoder().encode(JSON.stringify(body)),
		}),
	);
}

describe("album content upload", () => {
	it("invokes the upload command with the part the server expects", async () => {
		invokeMock.mockResolvedValue({
			response: encodedUploadResponse({
				contentId: 90007,
				contentUrl: null,
			}),
			sha256: uploadSha,
			bodySize: 4321,
		});

		const uploaded = await uploadAlbumContent({
			albumId: 900,
			media: pickedPhoto,
			inspection: photoInspection,
			limits: uploadLimits,
			profileId: 123456,
		});

		expect(invokeMock).toHaveBeenCalledWith("upload_media_file", {
			file: { source: "desktop", path: "/tmp/photo.png" },
			request: {
				method: "POST",
				path: "/v1/albums/900/content?isFresh=false",
				part: {
					name: "content",
					filename: "",
					contentType: "image/jpeg",
				},
			},
			maxBodySize: 125829120,
			profileId: "123456",
		});
		expect(uploaded).toEqual({ contentId: 90007, sha256: uploadSha });
	});

	it("sends a video as mp4 with the dimensions the server needs", async () => {
		invokeMock.mockResolvedValue({
			response: encodedUploadResponse({
				contentId: 90008,
				contentUrl: null,
			}),
			sha256: uploadSha,
			bodySize: 8_000_400,
		});

		await uploadAlbumContent({
			albumId: 900,
			media: pickedVideo,
			inspection: videoInspection,
			limits: uploadLimits,
			profileId: 123456,
		});

		expect(invokeMock).toHaveBeenCalledWith("upload_media_file", {
			file: { source: "desktop", path: "/tmp/clip.mov" },
			request: {
				method: "POST",
				path: "/v1/albums/900/content?isFresh=false&width=1080&height=1920",
				part: {
					name: "content",
					filename: "",
					contentType: "video/mp4",
				},
			},
			maxBodySize: 125829120,
			profileId: "123456",
		});
	});

	it("leaves the dimensions off a video it could not probe", async () => {
		invokeMock.mockResolvedValue({
			response: encodedUploadResponse({
				contentId: 90009,
				contentUrl: null,
			}),
			sha256: uploadSha,
			bodySize: 8_000_400,
		});

		await uploadAlbumContent({
			albumId: 900,
			media: pickedVideo,
			inspection: { kind: "video", size: 8_000_000 },
			limits: uploadLimits,
			profileId: 123456,
		});

		expect(invokeMock.mock.calls[0]?.[1]).toMatchObject({
			request: { path: "/v1/albums/900/content?isFresh=false" },
		});
	});

	it("rejects a response that is not an upload result", async () => {
		invokeMock.mockResolvedValue({
			response: encodedUploadResponse({ contentUrl: null }),
			sha256: uploadSha,
			bodySize: 4321,
		});

		await expect(
			uploadAlbumContent({
				albumId: 900,
				media: pickedPhoto,
				inspection: photoInspection,
				limits: uploadLimits,
				profileId: 123456,
			}),
		).rejects.toThrow();
	});

	it("carries the too-large refusal through as an ApiError kind", async () => {
		invokeMock.mockRejectedValue({ kind: "ContentTooLarge" });

		const error: unknown = await uploadAlbumContent({
			albumId: 900,
			media: pickedPhoto,
			inspection: photoInspection,
			limits: uploadLimits,
			profileId: 123456,
		}).catch((error: unknown) => error);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).kind).toBe("ContentTooLarge");
		expect(albumMediaErrorMessage({ error, limits: uploadLimits })).toBe(
			"Larger than the 120.00 MB limit",
		);
	});

	it("leaves every other failure without album-specific copy", () => {
		const error = new ApiError({
			message: "Something else",
			request: { method: "POST", path: "/v1/albums/900/content" },
			kind: "Api",
		});

		expect(
			albumMediaErrorMessage({ error, limits: uploadLimits }),
		).toBeNull();
	});

	it("prepends an uploaded photo to the demo album", () => {
		const before = demoAlbumContent(5002).content;

		const { contentId } = demoUploadAlbumContent({
			albumId: 5002,
			kind: "photo",
		});
		const after = demoAlbumContent(5002).content;

		expect(after).toHaveLength(before.length + 1);
		expect(after[0]).toMatchObject({
			contentId,
			contentType: "image/jpeg",
			processing: false,
		});
	});

	it("prepends an uploaded demo video that finishes processing", () => {
		vi.useFakeTimers();
		try {
			const { contentId } = demoUploadAlbumContent({
				albumId: 5003,
				kind: "video",
			});

			expect(demoAlbumContent(5003).content[0]).toMatchObject({
				contentId,
				contentType: "video/mp4",
				processing: true,
				statusId: 3,
				url: albumProcessingPlaceholderUrl,
			});
			expect(
				demoAlbumContentProcessing({ albumId: 5003, contentId }),
			).toEqual({ processing: true });

			vi.advanceTimersByTime(3000);

			expect(demoAlbumContent(5003).content[0]).toMatchObject({
				contentId,
				contentType: "video/mp4",
				processing: false,
				statusId: 1,
			});
			expect(
				demoAlbumContentProcessing({ albumId: 5003, contentId }),
			).toEqual({ processing: false });
		} finally {
			vi.useRealTimers();
		}
	});
});
