import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccountCaches } from "$lib/api/account-caches";
import { ApiError } from "$lib/api/api-error";
import type { AlbumContent } from "$lib/model/messaging/albums";
import { getAlbumUploads } from "./album-uploads-state.svelte";

vi.mock("svelte-sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("$lib/api/messaging/albums", async (importOriginal) => ({
	...(await importOriginal<object>()),
	addDrawerMediaToAlbum: vi.fn(),
	getAlbumContent: vi.fn(),
	getAlbumContentProcessing: vi.fn(),
}));

vi.mock("$lib/components/album/album-lightbox", () => ({
	forgetAlbumSlides: vi.fn(),
}));

const { addDrawerMediaToAlbum, getAlbumContent, getAlbumContentProcessing } =
	await import("$lib/api/messaging/albums");
const { forgetAlbumSlides } =
	await import("$lib/components/album/album-lightbox");

const ALBUM_ID = 4;

const OUR_PROFILE_ID = 11;

function albumItem(contentId: number): AlbumContent {
	return {
		contentId,
		contentType: "image/jpeg",
		coverUrl: null,
		statusId: 1,
		thumbUrl: "https://example.invalid/thumb.jpg",
		url: "https://example.invalid/full.jpg",
		processing: false,
		rejectionId: null,
	};
}

function videoItem(contentId: number, processing: boolean): AlbumContent {
	return {
		...albumItem(contentId),
		contentType: "video/mp4",
		processing,
		statusId: processing ? 3 : 1,
	};
}

function albumWith(...content: AlbumContent[]) {
	return { content } as unknown as Awaited<
		ReturnType<typeof getAlbumContent>
	>;
}

function httpError(status: number): ApiError {
	return new ApiError({
		message: `HTTP ${status}`,
		request: { method: "POST", path: "/v1/albums" },
		response: { status, body: "" },
	});
}

function draftSpy() {
	return { land: vi.fn(), replace: vi.fn(), forget: vi.fn() };
}

beforeEach(() => {
	vi.clearAllMocks();
	clearAccountCaches();
});

describe("adding drawer media to an album", () => {
	it("lands what the drawer added, first listed first, and watches a processing video", async () => {
		vi.mocked(addDrawerMediaToAlbum).mockResolvedValue(undefined);
		vi.mocked(getAlbumContent).mockResolvedValue(
			albumWith(albumItem(21), videoItem(22, true), albumItem(5)),
		);
		vi.mocked(getAlbumContentProcessing).mockReturnValue(
			new Promise(() => {}),
		);
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		await uploads.addFromDrawer({
			albumId: ALBUM_ID,
			mediaIds: [900, 901],
			present: [5],
		});
		await vi.waitFor(() => expect(draft.land).toHaveBeenCalledTimes(2));

		expect(addDrawerMediaToAlbum).toHaveBeenCalledWith({
			albumId: ALBUM_ID,
			mediaIds: [900, 901],
		});
		expect(draft.land.mock.calls.map(([item]) => item.contentId)).toEqual([
			22, 21,
		]);
		expect(forgetAlbumSlides).toHaveBeenCalledWith(ALBUM_ID);
	});

	it("leaves the draft alone when the album refuses the drawer media", async () => {
		vi.mocked(addDrawerMediaToAlbum).mockRejectedValue(httpError(402));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		await expect(
			uploads.addFromDrawer({
				albumId: ALBUM_ID,
				mediaIds: [900],
				present: [],
			}),
		).rejects.toThrow("HTTP 402");

		expect(getAlbumContent).not.toHaveBeenCalled();
		expect(draft.land).not.toHaveBeenCalled();
	});
});
