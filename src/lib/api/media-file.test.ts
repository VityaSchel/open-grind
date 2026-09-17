import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));

import { inspectMediaFile, mediaFileKindOf } from "$lib/api/media-file";
import type { PickedMedia } from "$lib/platform/media-picker";

beforeEach(() => {
	invokeMock.mockReset();
});

describe("mediaFileKindOf", () => {
	it("maps a MIME type onto the kinds the backend reports", () => {
		expect(mediaFileKindOf("image/png")).toBe("photo");
		expect(mediaFileKindOf("video/quicktime")).toBe("video");
		expect(mediaFileKindOf("application/pdf")).toBe("unsupported");
		expect(mediaFileKindOf(null)).toBe("unsupported");
	});
});

describe("inspectMediaFile", () => {
	it("answers a web file from its own type and size without the backend", async () => {
		const file = new File([new Uint8Array(12)], "clip.mp4", {
			type: "video/mp4",
		});
		const media = {
			source: "web",
			key: "web-1",
			mimeType: "video/mp4",
			file,
		} satisfies PickedMedia;

		await expect(inspectMediaFile(media)).resolves.toEqual({
			kind: "video",
			size: 12,
		});
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("sends only the file descriptor of a desktop pick to the backend", async () => {
		invokeMock.mockResolvedValue({ kind: "photo", size: 4096 });
		const media = {
			source: "desktop",
			key: "desk-1",
			mimeType: "image/jpeg",
			path: "/tmp/photo.jpg",
		} satisfies PickedMedia;

		await expect(inspectMediaFile(media)).resolves.toEqual({
			kind: "photo",
			size: 4096,
		});
		expect(invokeMock).toHaveBeenCalledWith("inspect_media_file", {
			file: { source: "desktop", path: "/tmp/photo.jpg" },
		});
	});

	it("sends the Android URI descriptor to the backend", async () => {
		invokeMock.mockResolvedValue({ kind: "video", size: 1 });
		const media = {
			source: "android",
			key: "and-1",
			mimeType: null,
			uri: { uri: "content://x", documentTopTreeUri: null },
		} satisfies PickedMedia;

		await expect(inspectMediaFile(media)).resolves.toEqual({
			kind: "video",
			size: 1,
		});
		expect(invokeMock).toHaveBeenCalledWith("inspect_media_file", {
			file: {
				source: "android",
				uri: { uri: "content://x", documentTopTreeUri: null },
			},
		});
	});

	it("rejects a backend answer outside the known kinds", async () => {
		invokeMock.mockResolvedValue({ kind: "audio", size: 1 });
		const media = {
			source: "desktop",
			key: "desk-2",
			mimeType: null,
			path: "/tmp/track.m4a",
		} satisfies PickedMedia;

		await expect(inspectMediaFile(media)).rejects.toThrow();
	});
});
