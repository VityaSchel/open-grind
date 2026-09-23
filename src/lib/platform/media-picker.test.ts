import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { androidFsMock, openMock, platformMock } = vi.hoisted(() => ({
	androidFsMock: { showOpenFilePicker: vi.fn() },
	openMock: vi.fn(),
	platformMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: platformMock }));
vi.mock("tauri-plugin-android-fs-api", () => ({ AndroidFs: androidFsMock }));

import type { AndroidFsUri } from "tauri-plugin-android-fs-api";

import { pickMedia, pickMultipleMedia } from "$lib/platform/media-picker";

const photoUri = {
	uri: "content://photo/1",
	documentTopTreeUri: null,
} satisfies AndroidFsUri;

const videoUri = {
	uri: "content://video/2",
	documentTopTreeUri: null,
} satisfies AndroidFsUri;

const firstKey = "00000000-0000-4000-8000-000000000001";
const secondKey = "00000000-0000-4000-8000-000000000002";

const tauri = globalThis as { isTauri?: boolean };

function runningOnAndroid() {
	tauri.isTauri = true;
	platformMock.mockReturnValue("android");
}

beforeEach(() => {
	openMock.mockReset();
	platformMock.mockReset();
	androidFsMock.showOpenFilePicker.mockReset();
	platformMock.mockReturnValue("macos");
});

afterEach(() => {
	vi.restoreAllMocks();
	delete tauri.isTauri;
});

describe("pickMedia", () => {
	it("returns null when the desktop picker is cancelled", async () => {
		openMock.mockResolvedValue(null);

		await expect(pickMedia("image")).resolves.toBeNull();

		expect(openMock).toHaveBeenCalledWith({
			filters: [
				{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
			],
			multiple: false,
		});
	});

	it("wraps the single path a desktop picker resolves outside an array", async () => {
		vi.spyOn(crypto, "randomUUID").mockReturnValue(firstKey);
		openMock.mockResolvedValue("/tmp/photo.png");

		await expect(pickMedia("image")).resolves.toEqual({
			source: "desktop",
			key: firstKey,
			mimeType: "image/png",
			path: "/tmp/photo.png",
		});
	});
});

describe("pickMultipleMedia", () => {
	it("maps desktop selections to fresh keys and known MIME types", async () => {
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(firstKey)
			.mockReturnValueOnce(secondKey);
		openMock.mockResolvedValue(["/tmp/clip.mov", "/tmp/raw.unknown"]);

		await expect(pickMultipleMedia("media")).resolves.toEqual([
			{
				source: "desktop",
				key: firstKey,
				mimeType: "video/quicktime",
				path: "/tmp/clip.mov",
			},
			{
				source: "desktop",
				key: secondKey,
				mimeType: null,
				path: "/tmp/raw.unknown",
			},
		]);

		expect(openMock).toHaveBeenCalledWith({
			filters: [
				{
					name: "Media",
					extensions: ["jpg", "jpeg", "png", "webp", "mp4", "mov"],
				},
			],
			multiple: true,
		});
	});

	it.each([
		["/tmp/photo.jpg", "image/jpeg"],
		["/tmp/photo.jpeg", "image/jpeg"],
		["/tmp/photo.PNG", "image/png"],
		["/tmp/photo.webp", "image/webp"],
		["/tmp/clip.mp4", "video/mp4"],
		["/tmp/clip.MOV", "video/quicktime"],
		["/tmp/clip.webm", null],
		["/tmp/noextension", null],
	])("resolves the MIME type of %s to %s", async (path, mimeType) => {
		vi.spyOn(crypto, "randomUUID").mockReturnValue(firstKey);
		openMock.mockResolvedValue([path]);

		await expect(pickMultipleMedia("media")).resolves.toEqual([
			{ source: "desktop", key: firstKey, mimeType, path },
		]);
	});

	it("narrows the desktop filter to videos for the video kind", async () => {
		openMock.mockResolvedValue([]);

		await pickMultipleMedia("video");

		expect(openMock).toHaveBeenCalledWith({
			filters: [{ name: "Videos", extensions: ["mp4", "mov"] }],
			multiple: true,
		});
	});

	it("uses Android gallery MIME filters and keeps the picker's URIs without reading them", async () => {
		runningOnAndroid();
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(firstKey)
			.mockReturnValueOnce(secondKey);
		androidFsMock.showOpenFilePicker.mockResolvedValue([
			photoUri,
			videoUri,
		]);

		await expect(pickMultipleMedia("media")).resolves.toEqual([
			{ source: "android", key: firstKey, mimeType: null, uri: photoUri },
			{
				source: "android",
				key: secondKey,
				mimeType: null,
				uri: videoUri,
			},
		]);

		expect(androidFsMock.showOpenFilePicker).toHaveBeenCalledWith({
			pickerType: "Gallery",
			mimeTypes: ["image/*", "video/*"],
			multiple: true,
		});
		expect(openMock).not.toHaveBeenCalled();
	});

	it("narrows the Android picker to videos for the video kind", async () => {
		runningOnAndroid();
		androidFsMock.showOpenFilePicker.mockResolvedValue([]);

		await pickMultipleMedia("video");

		expect(androidFsMock.showOpenFilePicker).toHaveBeenCalledWith({
			pickerType: "Gallery",
			mimeTypes: ["video/*"],
			multiple: true,
		});
	});
});
