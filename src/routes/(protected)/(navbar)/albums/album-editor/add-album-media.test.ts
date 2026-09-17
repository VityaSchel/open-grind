import { beforeEach, describe, expect, it, vi } from "vitest";

const picker = vi.hoisted(() => ({ pickMultipleMedia: vi.fn() }));
const store = vi.hoisted(() => ({
	uploads: { storageLimits: vi.fn(), pending: vi.fn(), enqueue: vi.fn() },
}));
const sonner = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
const errorToast = vi.hoisted(() => ({ showErrorToast: vi.fn() }));

vi.mock("$lib/api/error-toast", () => errorToast);
vi.mock("$lib/platform/media-picker", () => picker);
vi.mock("../album-uploads/album-uploads.svelte", () => store);
vi.mock("svelte-sonner", () => sonner);

import type { AlbumContent } from "$lib/model/messaging/albums";
import type { PickedMedia } from "$lib/platform/media-picker";
import { addAlbumMedia } from "./add-album-media";

const limits = {
	maxContentSize: 125829120,
	maxContentSizeHumanReadable: "120.00 MB",
	maxContentItemsPerAlbum: 10,
	maxVideosPerAlbum: 1,
};

const picked: PickedMedia[] = [
	{ source: "desktop", key: "p", mimeType: "image/jpeg", path: "/a.jpg" },
];

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
	store.uploads.pending.mockReturnValue([]);
	store.uploads.storageLimits.mockResolvedValue(limits);
	store.uploads.enqueue.mockResolvedValue({
		accepted: 1,
		dropped: 0,
		full: 0,
	});
	picker.pickMultipleMedia.mockResolvedValue(picked);
});

describe("adding media to an album", () => {
	it("offers videos while a video slot is free", async () => {
		await addAlbumMedia({ albumId: 903, content: [item(1, "image/jpeg")] });

		expect(picker.pickMultipleMedia).toHaveBeenCalledWith("media");
	});

	it("offers photos only once the album holds every video it can", async () => {
		await addAlbumMedia({ albumId: 903, content: [item(1, "video/mp4")] });

		expect(picker.pickMultipleMedia).toHaveBeenCalledWith("image");
	});

	it("counts uploads in flight against the video limit", async () => {
		store.uploads.pending.mockReturnValue([{ key: "a", kind: "video" }]);

		await addAlbumMedia({ albumId: 903, content: [] });

		expect(store.uploads.pending).toHaveBeenCalledWith(903);
		expect(picker.pickMultipleMedia).toHaveBeenCalledWith("image");
	});

	it("enqueues what was picked and names what the album had no room for", async () => {
		const content = [item(1, "image/jpeg")];
		store.uploads.enqueue.mockResolvedValue({
			accepted: 2,
			dropped: 3,
			full: 3,
		});

		await addAlbumMedia({ albumId: 903, content });

		expect(store.uploads.enqueue).toHaveBeenCalledWith({
			albumId: 903,
			picked,
			limits,
			content,
		});
		expect(sonner.toast.error).toHaveBeenCalledWith(
			"3 left out, the album is full",
		);
	});

	it("leaves an unsupported file to the refusal the store already showed", async () => {
		store.uploads.enqueue.mockResolvedValue({
			accepted: 1,
			dropped: 1,
			full: 0,
		});

		await addAlbumMedia({ albumId: 903, content: [] });

		expect(sonner.toast.error).not.toHaveBeenCalled();
	});

	it("says nothing when everything picked was accepted", async () => {
		await addAlbumMedia({ albumId: 903, content: [] });

		expect(sonner.toast.error).not.toHaveBeenCalled();
	});

	it("says nothing when the picker was dismissed", async () => {
		picker.pickMultipleMedia.mockResolvedValue([]);

		await addAlbumMedia({ albumId: 903, content: [] });

		expect(store.uploads.enqueue).not.toHaveBeenCalled();
		expect(sonner.toast.error).not.toHaveBeenCalled();
	});

	it("reports a failure to read the limits instead of picking", async () => {
		const error = new Error("offline");
		store.uploads.storageLimits.mockRejectedValue(error);

		await addAlbumMedia({ albumId: 903, content: [] });

		expect(picker.pickMultipleMedia).not.toHaveBeenCalled();
		expect(errorToast.showErrorToast).toHaveBeenCalledWith({
			label: "Couldn't add to album",
			error,
		});
	});
});
