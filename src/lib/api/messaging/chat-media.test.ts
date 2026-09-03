import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";

const { fetchRestMock, invokeMock, readMediaBytesMock } = vi.hoisted(() => ({
	fetchRestMock: vi.fn(),
	invokeMock: vi.fn(),
	readMediaBytesMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));
vi.mock("$lib/platform/media-picker", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/media-picker")>()),
	readMediaBytes: readMediaBytesMock,
}));

import { addMediaToDrawer } from "$lib/api/messaging/chat-media";
import type { PickedMedia } from "$lib/platform/media-picker";

const pickedMedia = {
	source: "desktop",
	key: "media-1",
	mimeType: "image/png",
	path: "/tmp/photo.png",
} satisfies PickedMedia;

const uploadedUrl = "https://cdns.grindr.com/images/chat/photo.jpg";

const assertOk = vi.fn();

beforeEach(() => {
	assertOk.mockReset();
	fetchRestMock.mockReset();
	invokeMock.mockReset();
	readMediaBytesMock.mockReset();
	fetchRestMock.mockResolvedValue({ assertOk });
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("addMediaToDrawer", () => {
	it("uploads the selected bytes, saves the upload to the drawer, and returns the drawer item", async () => {
		vi.spyOn(Date, "now").mockReturnValue(1_720_000_000_000);
		readMediaBytesMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
		invokeMock.mockResolvedValue({
			mediaId: 910_001,
			url: uploadedUrl,
			mediaHash: "hash-1",
		});

		await expect(addMediaToDrawer(pickedMedia)).resolves.toEqual({
			id: 910_001,
			url: uploadedUrl,
			contentType: "image/png",
			createdTs: 1_720_000_000_000,
			used: false,
			takenOnGrindr: false,
		});

		expect(readMediaBytesMock).toHaveBeenCalledWith(pickedMedia);
		expect(invokeMock).toHaveBeenCalledWith("upload_chat_media", {
			contentType: "image/png",
			takenOnGrindr: false,
			data: "AQID",
		});
		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/media/drawer/910001",
			{ method: "PUT" },
		);
		expect(assertOk).toHaveBeenCalledOnce();
	});

	it("falls back to JPEG when the picked media has no content type", async () => {
		readMediaBytesMock.mockResolvedValue(new Uint8Array([4, 5, 6]));
		invokeMock.mockResolvedValue({
			mediaId: 910_002,
			url: uploadedUrl,
			mediaHash: "hash-2",
		});

		await expect(
			addMediaToDrawer({ ...pickedMedia, mimeType: null }),
		).resolves.toMatchObject({ contentType: "image/jpeg" });

		expect(invokeMock).toHaveBeenCalledWith("upload_chat_media", {
			contentType: "image/jpeg",
			takenOnGrindr: false,
			data: "BAUG",
		});
	});

	it("rejects an upload response with a malformed media id without touching the drawer", async () => {
		readMediaBytesMock.mockResolvedValue(new Uint8Array([1]));
		invokeMock.mockResolvedValue({
			mediaId: "not-a-number",
			url: uploadedUrl,
			mediaHash: "hash-3",
		});

		await expect(addMediaToDrawer(pickedMedia)).rejects.toThrow(z.ZodError);

		expect(invokeMock).toHaveBeenCalledOnce();
		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("propagates a failed drawer save instead of reporting the media as added", async () => {
		readMediaBytesMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
		invokeMock.mockResolvedValue({
			mediaId: 910_004,
			url: uploadedUrl,
			mediaHash: "hash-4",
		});
		assertOk.mockImplementation(() => {
			throw new Error("status 500");
		});

		await expect(addMediaToDrawer(pickedMedia)).rejects.toThrow(
			"status 500",
		);

		expect(invokeMock).toHaveBeenCalledOnce();
	});
});
