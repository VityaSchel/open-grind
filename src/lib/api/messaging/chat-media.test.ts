import { encode } from "@msgpack/msgpack";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { addMediaToDrawer } from "$lib/api/messaging/chat-media";
import { toBase64 } from "$lib/util/base64";
import type { PickedMedia } from "$lib/platform/media-picker";

const pickedMedia = {
	source: "desktop",
	key: "media-1",
	mimeType: "image/png",
	path: "/tmp/photo.png",
} satisfies PickedMedia;

const uploadedUrl = "https://cdns.grindr.com/images/chat/photo.jpg";

const uploadPath = "/v5/chat/media/upload?takenOnGrindr=false";

function uploadResponse({ status, body }: { status: number; body: unknown }) {
	return toBase64(
		encode({
			status,
			body: new TextEncoder().encode(JSON.stringify(body)),
		}),
	);
}

const assertOk = vi.fn();

beforeEach(() => {
	assertOk.mockReset();
	fetchRestMock.mockReset();
	invokeMock.mockReset();
	fetchRestMock.mockResolvedValue({ assertOk });
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("addMediaToDrawer", () => {
	it("hands the picked path to the backend, saves the upload to the drawer and returns it as the JPEG it was re-encoded to", async () => {
		vi.spyOn(Date, "now").mockReturnValue(1_720_000_000_000);
		invokeMock.mockResolvedValue(
			uploadResponse({
				status: 200,
				body: {
					mediaId: 910_001,
					url: uploadedUrl,
					mediaHash: "hash-1",
				},
			}),
		);

		await expect(addMediaToDrawer(pickedMedia)).resolves.toEqual({
			id: 910_001,
			url: uploadedUrl,
			contentType: "image/jpeg",
			createdTs: 1_720_000_000_000,
			used: false,
			takenOnGrindr: false,
		});

		expect(invokeMock).toHaveBeenCalledWith("upload_media", {
			path: uploadPath,
			signed: false,
			file: { source: "desktop", path: "/tmp/photo.png" },
		});
		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/media/drawer/910001",
			{ method: "PUT" },
		);
		expect(assertOk).toHaveBeenCalledOnce();
	});

	it("hands an Android pick to the backend as its content URI, never as bytes", async () => {
		invokeMock.mockResolvedValue(
			uploadResponse({
				status: 200,
				body: {
					mediaId: 910_005,
					url: uploadedUrl,
					mediaHash: "hash-5",
				},
			}),
		);
		const uri = {
			uri: "content://media/picker/0/1",
			documentTopTreeUri: null,
		};

		await addMediaToDrawer({
			source: "android",
			key: "media-5",
			mimeType: null,
			uri,
		});

		expect(invokeMock).toHaveBeenCalledWith("upload_media", {
			path: uploadPath,
			signed: false,
			file: { source: "android", uri },
		});
	});

	it("refuses a browser-picked file outside the demo without calling the backend", async () => {
		await expect(
			addMediaToDrawer({
				source: "web",
				key: "media-6",
				mimeType: "image/png",
				file: new File([new Uint8Array([1])], "photo.png"),
			}),
		).rejects.toThrow("no native path");

		expect(invokeMock).not.toHaveBeenCalled();
		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("rejects a failed upload status without touching the drawer", async () => {
		invokeMock.mockResolvedValue(
			uploadResponse({
				status: 413,
				body: { type: "urn:gr:err:payload_too_large" },
			}),
		);

		await expect(addMediaToDrawer(pickedMedia)).rejects.toThrow(
			expect.objectContaining({
				name: "ApiError",
				request: { method: "POST", path: uploadPath },
				response: expect.objectContaining({ status: 413 }),
			}),
		);

		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("rejects an upload response with a malformed media id without touching the drawer", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		invokeMock.mockResolvedValue(
			uploadResponse({
				status: 200,
				body: {
					mediaId: "not-a-number",
					url: uploadedUrl,
					mediaHash: "hash-3",
				},
			}),
		);

		await expect(addMediaToDrawer(pickedMedia)).rejects.toThrow(ApiError);

		expect(invokeMock).toHaveBeenCalledOnce();
		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("propagates a failed drawer save instead of reporting the media as added", async () => {
		invokeMock.mockResolvedValue(
			uploadResponse({
				status: 200,
				body: {
					mediaId: 910_004,
					url: uploadedUrl,
					mediaHash: "hash-4",
				},
			}),
		);
		assertOk.mockImplementation(() => {
			throw new Error("status 500");
		});

		await expect(addMediaToDrawer(pickedMedia)).rejects.toThrow(
			"status 500",
		);

		expect(invokeMock).toHaveBeenCalledOnce();
	});
});
