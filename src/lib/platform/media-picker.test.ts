import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { androidFsMock, invokeMock, openMock, toastMock } = vi.hoisted(() => ({
	androidFsMock: { showOpenFilePicker: vi.fn() },
	invokeMock: vi.fn(),
	openMock: vi.fn(),
	toastMock: { error: vi.fn() },
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));
vi.mock("tauri-plugin-android-fs-api", () => ({ AndroidFs: androidFsMock }));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

import type { AndroidFsUri } from "tauri-plugin-android-fs-api";

import { pickMedia, pickMultipleMedia } from "$lib/platform/media-picker";
import { runningOn } from "$lib/test/platform";
import type { SupportedPlatform } from "$lib/platform/os";

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

beforeEach(() => {
	invokeMock.mockReset();
	openMock.mockReset();
	androidFsMock.showOpenFilePicker.mockReset();
	toastMock.error.mockReset();
	runningOn("macos");
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("pickMedia", () => {
	it("returns null when the desktop picker is cancelled", async () => {
		openMock.mockResolvedValue(null);

		await expect(pickMedia("image")).resolves.toBeNull();

		expect(openMock).toHaveBeenCalledWith({
			filters: [
				{
					name: "Images",
					extensions: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
				},
			],
			multiple: false,
		});
		expect(invokeMock).not.toHaveBeenCalled();
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

	it("asks the Android content picker for one video when picking a single video", async () => {
		runningOn("android");
		vi.spyOn(crypto, "randomUUID").mockReturnValue(firstKey);
		invokeMock.mockResolvedValue([videoUri.uri]);

		await expect(pickMedia("video")).resolves.toEqual({
			source: "android",
			key: firstKey,
			mimeType: null,
			uri: videoUri,
		});

		expect(invokeMock).toHaveBeenCalledExactlyOnceWith(
			"pick_android_media",
			{ mimeTypes: ["video/*"], multiple: false },
		);
	});

	it("returns null without the dialog when the iOS picker is cancelled", async () => {
		runningOn("ios");
		invokeMock.mockResolvedValue({ picks: [], failed: 0 });

		await expect(pickMedia("video")).resolves.toBeNull();

		expect(invokeMock).toHaveBeenCalledExactlyOnceWith("pick_ios_media", {
			kind: "video",
			multiple: false,
		});
		expect(openMock).not.toHaveBeenCalled();
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
					extensions: [
						"jpg",
						"jpeg",
						"png",
						"webp",
						"mp4",
						"mov",
						"heic",
						"heif",
					],
				},
			],
			multiple: true,
		});
	});

	it.each([
		{
			platform: "macos",
			images: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
			media: ["jpg", "jpeg", "png", "webp", "mp4", "mov", "heic", "heif"],
		},
		{
			platform: "linux",
			images: ["jpg", "jpeg", "png", "webp"],
			media: ["jpg", "jpeg", "png", "webp", "mp4", "mov"],
		},
		{
			platform: "windows",
			images: ["jpg", "jpeg", "png", "webp"],
			media: ["jpg", "jpeg", "png", "webp", "mp4", "mov"],
		},
	] satisfies {
		platform: SupportedPlatform;
		images: string[];
		media: string[];
	}[])(
		"offers the $platform dialog only the photo types it can decode",
		async ({ platform, images, media }) => {
			runningOn(platform);
			openMock.mockResolvedValue([]);

			await pickMultipleMedia("image");
			await pickMultipleMedia("media");

			expect(openMock.mock.calls).toEqual([
				[
					{
						filters: [{ name: "Images", extensions: images }],
						multiple: true,
					},
				],
				[
					{
						filters: [{ name: "Media", extensions: media }],
						multiple: true,
					},
				],
			]);
		},
	);

	it.each([
		["/tmp/photo.jpg", "image/jpeg"],
		["/tmp/photo.jpeg", "image/jpeg"],
		["/tmp/photo.PNG", "image/png"],
		["/tmp/photo.webp", "image/webp"],
		["/tmp/photo.HEIC", "image/heic"],
		["/tmp/photo.heif", "image/heif"],
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

	it("opens the Android picker for content when the system routes it to the Photo Picker", async () => {
		runningOn("android");
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(firstKey)
			.mockReturnValueOnce(secondKey);
		invokeMock.mockResolvedValue([photoUri.uri, videoUri.uri]);

		await expect(pickMultipleMedia("media")).resolves.toEqual([
			{ source: "android", key: firstKey, mimeType: null, uri: photoUri },
			{
				source: "android",
				key: secondKey,
				mimeType: null,
				uri: videoUri,
			},
		]);

		expect(invokeMock).toHaveBeenCalledExactlyOnceWith(
			"pick_android_media",
			{ mimeTypes: ["image/*", "video/*"], multiple: true },
		);
		expect(androidFsMock.showOpenFilePicker).not.toHaveBeenCalled();
		expect(openMock).not.toHaveBeenCalled();
	});

	it("resolves nothing without the gallery fallback when the Android content picker is cancelled", async () => {
		runningOn("android");
		invokeMock.mockResolvedValue([]);

		await expect(pickMultipleMedia("media")).resolves.toEqual([]);
		await expect(pickMedia("image")).resolves.toBeNull();

		expect(androidFsMock.showOpenFilePicker).not.toHaveBeenCalled();
	});

	it("falls back to the Android gallery picker with the same filters when the content picker is unsupported", async () => {
		runningOn("android");
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(firstKey)
			.mockReturnValueOnce(secondKey);
		invokeMock.mockResolvedValue(null);
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

		expect(
			androidFsMock.showOpenFilePicker,
		).toHaveBeenCalledExactlyOnceWith({
			pickerType: "Gallery",
			mimeTypes: ["image/*", "video/*"],
			multiple: true,
		});
		expect(openMock).not.toHaveBeenCalled();
	});

	it("keeps the iOS selection order", async () => {
		runningOn("ios");
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(firstKey)
			.mockReturnValueOnce(secondKey);
		invokeMock.mockResolvedValue({
			picks: [{ id: "staged-2" }, { id: "staged-1" }],
			failed: 0,
		});

		await expect(pickMultipleMedia("media")).resolves.toEqual([
			{ source: "staged", key: firstKey, mimeType: null, id: "staged-2" },
			{
				source: "staged",
				key: secondKey,
				mimeType: null,
				id: "staged-1",
			},
		]);

		expect(invokeMock).toHaveBeenCalledExactlyOnceWith("pick_ios_media", {
			kind: "media",
			multiple: true,
		});
		expect(openMock).not.toHaveBeenCalled();
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("keeps the iOS picks that loaded and says how many did not", async () => {
		runningOn("ios");
		vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(firstKey);
		invokeMock.mockResolvedValue({
			picks: [{ id: "staged-1" }],
			failed: 2,
		});

		await expect(pickMultipleMedia("image")).resolves.toEqual([
			{ source: "staged", key: firstKey, mimeType: null, id: "staged-1" },
		]);

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Couldn't load 2 of the picked items",
		);
	});

	it("narrows the Android gallery fallback to videos for the video kind", async () => {
		runningOn("android");
		invokeMock.mockResolvedValue(null);
		androidFsMock.showOpenFilePicker.mockResolvedValue([]);

		await expect(pickMultipleMedia("video")).resolves.toEqual([]);

		expect(androidFsMock.showOpenFilePicker).toHaveBeenCalledWith({
			pickerType: "Gallery",
			mimeTypes: ["video/*"],
			multiple: true,
		});
	});
});
