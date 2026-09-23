import { beforeEach, describe, expect, it, vi } from "vitest";

const picker = vi.hoisted(() => ({ pickMultipleMedia: vi.fn() }));
const mediaFile = vi.hoisted(() => ({ inspectMediaFile: vi.fn() }));
const api = vi.hoisted(() => ({ getAlbumStorageLimits: vi.fn() }));
const sonner = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
const errorToast = vi.hoisted(() => ({ showErrorToast: vi.fn() }));

vi.mock("$lib/api/error-toast", () => errorToast);
vi.mock("$lib/api/messaging/albums", () => api);
vi.mock("$lib/platform/media-file", async (importOriginal) => ({
	...(await importOriginal<object>()),
	...mediaFile,
}));
vi.mock("$lib/platform/media-picker", () => picker);
vi.mock("svelte-sonner", () => sonner);

import type { AlbumContent } from "$lib/model/messaging/albums";
import type { PickedMedia } from "$lib/platform/media-picker";
import { addAlbumMedia, pickInspectedAlbumMedia } from "./add-album-media";
import type { AlbumUploads } from "./album-uploads-state.svelte";

const limits = {
	maxContentSize: 125829120,
	maxContentSizeHumanReadable: "120.00 MB",
	maxContentItemsPerAlbum: 10,
	maxVideosPerAlbum: 1,
};

function desktopPick(key: string, mimeType: string): PickedMedia {
	return { source: "desktop", key, mimeType, path: `/tmp/${key}` };
}

const picked = [desktopPick("p", "image/jpeg")];

const inspected = picked.map((media) => ({
	media,
	inspection: { kind: "photo" as const, size: 1024 },
}));

const store = { pending: vi.fn(), enqueue: vi.fn() };

const uploads = store as unknown as AlbumUploads;

function item(contentId: number, contentType: string): AlbumContent {
	return {
		contentId,
		contentType,
		coverUrl: "https://example.invalid/cover",
		statusId: 1,
		thumbUrl: "https://example.invalid/thumb",
		url: "https://example.invalid/media",
		processing: false,
		rejectionId: null,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	store.pending.mockReturnValue([]);
	store.enqueue.mockReturnValue({ leftOutFull: 0, leftOutVideoSlot: 0 });
	api.getAlbumStorageLimits.mockResolvedValue(limits);
	mediaFile.inspectMediaFile.mockImplementation((media: PickedMedia) =>
		Promise.resolve({
			kind: media.mimeType?.startsWith("video/")
				? "video"
				: media.mimeType?.startsWith("image/")
					? "photo"
					: "unsupported",
			size: 1024,
		}),
	);
	picker.pickMultipleMedia.mockResolvedValue(picked);
});

describe("picking media for an album", () => {
	it("offers only the kinds the album has room for", async () => {
		await pickInspectedAlbumMedia({ room: { photos: true, videos: true } });
		await pickInspectedAlbumMedia({
			room: { photos: true, videos: false },
		});
		await pickInspectedAlbumMedia({
			room: { photos: false, videos: true },
		});

		expect(picker.pickMultipleMedia.mock.calls).toEqual([
			["media"],
			["image"],
			["video"],
		]);
	});

	it("opens no picker when the album has room for nothing", async () => {
		expect(
			await pickInspectedAlbumMedia({
				room: { photos: false, videos: false },
			}),
		).toEqual([]);
		expect(picker.pickMultipleMedia).not.toHaveBeenCalled();
	});

	it("refuses a file that is neither a photo nor a video", async () => {
		picker.pickMultipleMedia.mockResolvedValue([
			desktopPick("a", "application/pdf"),
			desktopPick("b", "image/jpeg"),
		]);

		expect(
			await pickInspectedAlbumMedia({
				room: { photos: true, videos: true },
			}),
		).toEqual([
			{
				media: desktopPick("b", "image/jpeg"),
				inspection: { kind: "photo", size: 1024 },
			},
		]);
		expect(sonner.toast.error).toHaveBeenCalledWith(
			"That file isn't a photo or video",
		);
	});

	it("refuses a file it cannot inspect at all", async () => {
		mediaFile.inspectMediaFile.mockRejectedValue(new Error("gone"));

		expect(
			await pickInspectedAlbumMedia({
				room: { photos: true, videos: true },
			}),
		).toEqual([]);
		expect(sonner.toast.error).toHaveBeenCalledWith(
			"That file isn't a photo or video",
		);
	});
});

describe("adding media to an album", () => {
	it("offers videos while a video slot is free", async () => {
		await addAlbumMedia({
			uploads,
			albumId: 903,
			content: () => [item(1, "image/jpeg")],
		});

		expect(picker.pickMultipleMedia).toHaveBeenCalledWith("media");
	});

	it("offers photos only once the album holds every video it can", async () => {
		await addAlbumMedia({
			uploads,
			albumId: 903,
			content: () => [item(1, "video/mp4")],
		});

		expect(picker.pickMultipleMedia).toHaveBeenCalledWith("image");
	});

	it("offers videos only once the album holds every photo it can", async () => {
		await addAlbumMedia({
			uploads,
			albumId: 903,
			content: () =>
				Array.from({ length: 10 }, (_, index) =>
					item(index + 1, "image/jpeg"),
				),
		});

		expect(picker.pickMultipleMedia).toHaveBeenCalledWith("video");
	});

	it("opens no picker once the album holds every photo and video it can", async () => {
		await addAlbumMedia({
			uploads,
			albumId: 903,
			content: () => [
				...Array.from({ length: 10 }, (_, index) =>
					item(index + 1, "image/jpeg"),
				),
				item(11, "video/mp4"),
			],
		});

		expect(picker.pickMultipleMedia).not.toHaveBeenCalled();
		expect(store.enqueue).not.toHaveBeenCalled();
		expect(sonner.toast.error).toHaveBeenCalledWith(
			"The album is full. Remove something to add more.",
		);
	});

	it("counts uploads in flight against the video limit", async () => {
		store.pending.mockReturnValue([{ key: "a", kind: "video" }]);

		await addAlbumMedia({ uploads, albumId: 903, content: () => [] });

		expect(store.pending).toHaveBeenCalledWith(903);
		expect(picker.pickMultipleMedia).toHaveBeenCalledWith("image");
	});

	it("counts uploads in flight against the photo limit", async () => {
		store.pending.mockReturnValue(
			Array.from({ length: 10 }, (_, index) => ({
				key: String(index),
				kind: "photo",
			})),
		);

		await addAlbumMedia({ uploads, albumId: 903, content: () => [] });

		expect(picker.pickMultipleMedia).toHaveBeenCalledWith("video");
	});

	it("enqueues what was picked and names what the album had no room for", async () => {
		const content = [item(1, "image/jpeg")];
		store.enqueue.mockReturnValue({ leftOutFull: 3, leftOutVideoSlot: 0 });

		await addAlbumMedia({ uploads, albumId: 903, content: () => content });

		expect(store.enqueue).toHaveBeenCalledWith({
			albumId: 903,
			inspected,
			limits,
			content,
		});
		expect(sonner.toast.error).toHaveBeenCalledWith(
			"3 left out, the album is full",
		);
	});

	it("names the video limit when a video was dropped for it", async () => {
		store.enqueue.mockReturnValue({ leftOutFull: 0, leftOutVideoSlot: 2 });

		await addAlbumMedia({ uploads, albumId: 903, content: () => [] });

		expect(sonner.toast.error).toHaveBeenCalledWith(
			"You can have 1 video in your album. Remove one to add another.",
		);
	});

	it("counts what the album holds once the picker closes", async () => {
		let content: AlbumContent[] = [];
		picker.pickMultipleMedia.mockImplementation(() => {
			content = [item(1, "image/jpeg")];
			return Promise.resolve(picked);
		});

		await addAlbumMedia({ uploads, albumId: 903, content: () => content });

		expect(store.enqueue).toHaveBeenCalledWith({
			albumId: 903,
			inspected,
			limits,
			content: [item(1, "image/jpeg")],
		});
	});

	it("leaves an unsupported file to the refusal inspection already showed", async () => {
		picker.pickMultipleMedia.mockResolvedValue([
			desktopPick("a", "application/pdf"),
		]);

		await addAlbumMedia({ uploads, albumId: 903, content: () => [] });

		expect(store.enqueue).not.toHaveBeenCalled();
		expect(sonner.toast.error).toHaveBeenCalledTimes(1);
		expect(sonner.toast.error).toHaveBeenCalledWith(
			"That file isn't a photo or video",
		);
	});

	it("says nothing when everything picked was accepted", async () => {
		await addAlbumMedia({ uploads, albumId: 903, content: () => [] });

		expect(sonner.toast.error).not.toHaveBeenCalled();
	});

	it("says nothing when the picker was dismissed", async () => {
		picker.pickMultipleMedia.mockResolvedValue([]);

		await addAlbumMedia({ uploads, albumId: 903, content: () => [] });

		expect(store.enqueue).not.toHaveBeenCalled();
		expect(sonner.toast.error).not.toHaveBeenCalled();
	});

	it("reports a failure to read the limits instead of picking", async () => {
		const error = new Error("offline");
		api.getAlbumStorageLimits.mockRejectedValue(error);

		await addAlbumMedia({ uploads, albumId: 903, content: () => [] });

		expect(picker.pickMultipleMedia).not.toHaveBeenCalled();
		expect(errorToast.showErrorToast).toHaveBeenCalledWith({
			label: "Couldn't add to album",
			error,
		});
	});
});
