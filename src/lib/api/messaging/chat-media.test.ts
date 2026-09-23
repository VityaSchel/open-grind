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
import {
	addMediaToDrawer,
	CHAT_MEDIA_MAX_BYTES,
	UnsupportedChatMediaError,
} from "$lib/api/messaging/chat-media";
import { toBase64 } from "$lib/util/base64";
import type { MediaFileInspection } from "$lib/platform/media-file";
import type { PickedMedia } from "$lib/platform/media-picker";

const pickedMedia = {
	source: "desktop",
	key: "media-1",
	mimeType: "image/png",
	path: "/tmp/photo.png",
} satisfies PickedMedia;

const uploadedUrl = "https://cdns.grindr.com/images/chat/photo.jpg";

const photoUploadPath = "/v5/chat/media/upload?takenOnGrindr=false";

const photo: MediaFileInspection = { kind: "photo", size: 2048 };

function uploadResponse({ status, body }: { status: number; body: unknown }) {
	return toBase64(
		encode({
			status,
			body: new TextEncoder().encode(JSON.stringify(body)),
		}),
	);
}

function backend({
	inspection = photo,
	status = 200,
	body = { mediaId: 910_001, url: uploadedUrl, mediaHash: "hash-1" },
}: { inspection?: MediaFileInspection; status?: number; body?: unknown } = {}) {
	invokeMock.mockImplementation((command: string) => {
		switch (command) {
			case "inspect_media_file":
				return Promise.resolve(inspection);
			case "current_session":
				return Promise.resolve({
					profileId: 42,
					expiresAt: null,
					stale: false,
				});
			case "upload_media_file":
				return Promise.resolve({
					response: uploadResponse({ status, body }),
					sha256: "a".repeat(64),
					bodySize: inspection.size,
				});
		}
		return Promise.reject(new Error(`unexpected command ${command}`));
	});
}

function uploadCall() {
	return invokeMock.mock.calls.find(
		([command]) => command === "upload_media_file",
	)?.[1];
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
	it("streams the picked photo as the raw body, saves it to the drawer and returns it as the JPEG it was re-encoded to", async () => {
		vi.spyOn(Date, "now").mockReturnValue(1_720_000_000_000);
		backend();

		await expect(addMediaToDrawer(pickedMedia)).resolves.toEqual({
			id: 910_001,
			url: uploadedUrl,
			contentType: "image/jpeg",
			createdTs: 1_720_000_000_000,
			used: false,
			takenOnGrindr: false,
		});

		expect(uploadCall()).toEqual({
			file: { source: "desktop", path: "/tmp/photo.png" },
			request: { method: "POST", path: photoUploadPath, part: null },
			maxBodySize: CHAT_MEDIA_MAX_BYTES,
			profileId: "42",
		});
		expect(invokeMock).not.toHaveBeenCalledWith(
			"upload_media",
			expect.anything(),
		);
		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/media/drawer/910001",
			{ method: "PUT" },
		);
		expect(assertOk).toHaveBeenCalledOnce();
	});

	it("hands an Android pick to the backend as its content URI, never as bytes", async () => {
		backend();
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

		expect(uploadCall()).toMatchObject({
			file: { source: "android", uri },
		});
	});

	it("sends a video with its length in milliseconds and keeps it when the drawer refuses it", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		backend({
			inspection: {
				kind: "video",
				size: 3_000_000,
				width: 1280,
				height: 720,
				durationMs: 8_023,
			},
		});
		assertOk.mockImplementation(() => {
			throw new Error("status 400");
		});

		await expect(addMediaToDrawer(pickedMedia)).resolves.toMatchObject({
			id: 910_001,
			contentType: "video/mp4",
		});

		expect(uploadCall()).toMatchObject({
			request: {
				path: "/v5/chat/media/upload?takenOnGrindr=false&length=8023&looping=false",
				part: null,
			},
		});
	});

	it("refuses a file that is neither a photo nor a video without uploading it", async () => {
		backend({ inspection: { kind: "unsupported", size: 10 } });

		await expect(addMediaToDrawer(pickedMedia)).rejects.toThrow(
			UnsupportedChatMediaError,
		);

		expect(uploadCall()).toBeUndefined();
		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("refuses a browser-picked file outside the demo without calling the backend", async () => {
		await expect(
			addMediaToDrawer({
				source: "web",
				key: "media-6",
				mimeType: "image/png",
				file: new File([new Uint8Array([1])], "photo.png", {
					type: "image/png",
				}),
			}),
		).rejects.toThrow("no native path");

		expect(invokeMock).not.toHaveBeenCalled();
		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("rejects a failed upload status without touching the drawer", async () => {
		backend({
			status: 413,
			body: { type: "urn:gr:err:payload_too_large" },
		});

		await expect(addMediaToDrawer(pickedMedia)).rejects.toThrow(
			expect.objectContaining({
				name: "ApiError",
				request: { method: "POST", path: photoUploadPath },
				response: expect.objectContaining({ status: 413 }),
			}),
		);

		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("rejects an upload response with a malformed media id without touching the drawer", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		backend({
			body: {
				mediaId: "not-a-number",
				url: uploadedUrl,
				mediaHash: "hash-3",
			},
		});

		await expect(addMediaToDrawer(pickedMedia)).rejects.toThrow(ApiError);

		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("propagates a failed drawer save for a photo instead of reporting it as added", async () => {
		backend();
		assertOk.mockImplementation(() => {
			throw new Error("status 500");
		});

		await expect(addMediaToDrawer(pickedMedia)).rejects.toThrow(
			"status 500",
		);
	});
});
