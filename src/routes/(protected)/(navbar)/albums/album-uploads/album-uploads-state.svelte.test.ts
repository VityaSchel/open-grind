import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccountCaches } from "$lib/api/account-caches";
import { ApiError } from "$lib/api/api-error";
import type { AlbumContent } from "$lib/model/messaging/albums";
import type { PickedMedia } from "$lib/platform/media-picker";
import {
	type AlbumUploads,
	getAlbumUploads,
	type InspectedPick,
	type UploadLimits,
} from "./album-uploads-state.svelte";

const { toastError, toastSuccess } = vi.hoisted(() => ({
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock("svelte-sonner", () => ({
	toast: { error: toastError, success: toastSuccess },
}));

vi.mock("$lib/api/messaging/albums", async (importOriginal) => ({
	...(await importOriginal<object>()),
	getAlbumContent: vi.fn(),
	getAlbumContentProcessing: vi.fn(),
	getMyAlbums: vi.fn(),
	uploadAlbumContent: vi.fn(),
}));

vi.mock("$lib/components/album/album-lightbox", () => ({
	forgetAlbumSlides: vi.fn(),
}));

const {
	getAlbumContent,
	getAlbumContentProcessing,
	getMyAlbums,
	uploadAlbumContent,
} = await import("$lib/api/messaging/albums");
const { forgetAlbumSlides } =
	await import("$lib/components/album/album-lightbox");

vi.spyOn(console, "error").mockImplementation(() => undefined);

const ALBUM_ID = 4;

const OUR_PROFILE_ID = 11;

const limits: UploadLimits = {
	maxContentSize: 125_829_120,
	maxContentSizeHumanReadable: "120 MB",
	maxContentItemsPerAlbum: 3,
	maxVideosPerAlbum: 1,
};

function media(key: string, mimeType: string): PickedMedia {
	return { key, mimeType, source: "desktop", path: `/tmp/${key}` };
}

function pick(key: string, mimeType: string): InspectedPick {
	const kind = mimeType.startsWith("video/") ? "video" : "photo";
	return { media: media(key, mimeType), inspection: { kind, size: 1024 } };
}

function albumItem(contentId: number, contentHash?: string): AlbumContent {
	return {
		contentId,
		contentType: "image/jpeg",
		coverUrl: null,
		statusId: 1,
		thumbUrl: "https://example.invalid/thumb.jpg",
		url: "https://example.invalid/full.jpg",
		processing: false,
		rejectionId: null,
		...(contentHash === undefined ? {} : { contentHash }),
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

function enqueue(uploads: AlbumUploads, ...inspected: InspectedPick[]) {
	uploads.enqueue({ albumId: ALBUM_ID, inspected, limits, content: [] });
}

function draftSpy() {
	return { land: vi.fn(), replace: vi.fn(), forget: vi.fn() };
}

beforeEach(() => {
	vi.clearAllMocks();
	clearAccountCaches();
	vi.mocked(getAlbumContent).mockResolvedValue(albumWith());
	vi.mocked(getMyAlbums).mockResolvedValue({ albums: [] });
});

describe("album uploads", () => {
	it("queues videos first and trims the rest to the album capacity", () => {
		vi.mocked(uploadAlbumContent).mockReturnValue(new Promise(() => {}));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		const counts = uploads.enqueue({
			albumId: ALBUM_ID,
			inspected: [
				pick("a", "image/jpeg"),
				pick("b", "image/jpeg"),
				pick("c", "image/jpeg"),
				pick("d", "image/jpeg"),
				pick("e", "video/mp4"),
				pick("f", "video/mp4"),
			],
			limits,
			content: [],
		});

		expect(counts).toEqual({ leftOutFull: 1, leftOutVideoSlot: 1 });
		expect(uploads.pending(ALBUM_ID)).toEqual([
			{ key: "e", kind: "video" },
			{ key: "a", kind: "photo" },
			{ key: "b", kind: "photo" },
			{ key: "c", kind: "photo" },
		]);
	});

	it("counts the content already in the album against the capacity", () => {
		vi.mocked(uploadAlbumContent).mockReturnValue(new Promise(() => {}));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		const counts = uploads.enqueue({
			albumId: ALBUM_ID,
			inspected: [pick("a", "image/jpeg"), pick("b", "video/mp4")],
			limits,
			content: [
				albumItem(1),
				albumItem(2),
				albumItem(3),
				{ ...albumItem(4), contentType: "video/mp4" },
			],
		});

		expect(counts).toEqual({ leftOutFull: 2, leftOutVideoSlot: 0 });
		expect(uploads.hasPending(ALBUM_ID)).toBe(false);
	});

	it("leaves a video out of an album already full of photos", () => {
		vi.mocked(uploadAlbumContent).mockReturnValue(new Promise(() => {}));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		const counts = uploads.enqueue({
			albumId: ALBUM_ID,
			inspected: [pick("a", "video/mp4")],
			limits,
			content: [albumItem(1), albumItem(2), albumItem(3)],
		});

		expect(counts).toEqual({ leftOutFull: 1, leftOutVideoSlot: 0 });
		expect(uploads.hasPending(ALBUM_ID)).toBe(false);
	});

	it("keeps the free video slot open while the album has photo room", () => {
		vi.mocked(uploadAlbumContent).mockReturnValue(new Promise(() => {}));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		const counts = uploads.enqueue({
			albumId: ALBUM_ID,
			inspected: [pick("a", "video/mp4"), pick("b", "video/mp4")],
			limits,
			content: [albumItem(1), albumItem(2)],
		});

		expect(counts).toEqual({ leftOutFull: 0, leftOutVideoSlot: 1 });
		expect(uploads.pending(ALBUM_ID)).toEqual([
			{ key: "a", kind: "video" },
		]);
	});

	it("hands a landed item to the open draft", async () => {
		vi.mocked(uploadAlbumContent).mockResolvedValue({
			contentId: 7,
			sha256: "a".repeat(64),
		});
		vi.mocked(getAlbumContent).mockResolvedValue(albumWith(albumItem(7)));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		enqueue(uploads, pick("a", "image/jpeg"));
		await vi.waitFor(() => expect(draft.land).toHaveBeenCalled());

		expect(draft.land).toHaveBeenCalledWith(albumItem(7));
		expect(forgetAlbumSlides).toHaveBeenCalledWith(ALBUM_ID);
		expect(uploads.hasPending(ALBUM_ID)).toBe(false);
	});

	it("retries the album read until it answers", async () => {
		vi.useFakeTimers();
		vi.mocked(uploadAlbumContent).mockResolvedValue({
			contentId: 7,
			sha256: "a".repeat(64),
		});
		vi.mocked(getAlbumContent)
			.mockRejectedValueOnce(httpError(500))
			.mockRejectedValueOnce(httpError(500))
			.mockResolvedValue(albumWith(albumItem(7)));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		try {
			enqueue(uploads, pick("a", "image/jpeg"));
			await vi.advanceTimersByTimeAsync(0);

			expect(uploads.hasPending(ALBUM_ID)).toBe(true);
			expect(draft.land).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(12_000);

			expect(draft.land).toHaveBeenCalledWith(albumItem(7));
			expect(getAlbumContent).toHaveBeenCalledTimes(3);
			expect(uploads.hasPending(ALBUM_ID)).toBe(false);
			expect(toastSuccess).not.toHaveBeenCalled();
			expect(toastError).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("drops the tile when the album read never answers", async () => {
		vi.useFakeTimers();
		vi.mocked(uploadAlbumContent).mockResolvedValue({
			contentId: 7,
			sha256: "a".repeat(64),
		});
		vi.mocked(getAlbumContent).mockRejectedValue(httpError(500));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		try {
			enqueue(uploads, pick("a", "image/jpeg"));
			await vi.advanceTimersByTimeAsync(30_000);

			expect(uploads.hasPending(ALBUM_ID)).toBe(true);
			expect(toastSuccess).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(40_000);

			expect(toastSuccess).toHaveBeenCalledWith(
				"Added. Reopen the album to see it",
			);
			expect(getAlbumContent).toHaveBeenCalledTimes(13);
			expect(draft.land).not.toHaveBeenCalled();
			expect(uploads.hasPending(ALBUM_ID)).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("reconciles an unconfirmed failure by content hash", async () => {
		vi.useFakeTimers();
		const sha256 = "b".repeat(64);
		vi.mocked(uploadAlbumContent).mockImplementation(({ onHashed }) => {
			onHashed?.(sha256);
			return Promise.reject(httpError(502));
		});
		vi.mocked(getMyAlbums).mockResolvedValue({
			albums: [{ albumId: ALBUM_ID, content: [albumItem(9, sha256)] }],
		} as unknown as Awaited<ReturnType<typeof getMyAlbums>>);
		vi.mocked(getAlbumContent).mockResolvedValue(albumWith(albumItem(9)));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		try {
			enqueue(uploads, pick("a", "image/jpeg"));
			await vi.advanceTimersByTimeAsync(5_000);

			expect(draft.land).toHaveBeenCalledWith(albumItem(9));
			expect(toastError).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("leaves a hash match the album already held to the copy that landed first", async () => {
		vi.useFakeTimers();
		const sha256 = "c".repeat(64);
		vi.mocked(uploadAlbumContent).mockImplementation(({ onHashed }) => {
			onHashed?.(sha256);
			return Promise.reject(httpError(502));
		});
		vi.mocked(getMyAlbums).mockResolvedValue({
			albums: [{ albumId: ALBUM_ID, content: [albumItem(9, sha256)] }],
		} as unknown as Awaited<ReturnType<typeof getMyAlbums>>);
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		try {
			uploads.enqueue({
				albumId: ALBUM_ID,
				inspected: [pick("a", "image/jpeg")],
				limits,
				content: [albumItem(9, sha256)],
			});
			await vi.advanceTimersByTimeAsync(60_000);

			expect(draft.land).not.toHaveBeenCalled();
			expect(toastError).toHaveBeenCalledWith("Couldn't add photo");
		} finally {
			vi.useRealTimers();
		}
	});

	it("gives up on an unconfirmed failure that never lands", async () => {
		vi.useFakeTimers();
		vi.mocked(uploadAlbumContent).mockRejectedValue(httpError(502));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		try {
			enqueue(uploads, pick("a", "video/mp4"));
			await vi.advanceTimersByTimeAsync(60_000);

			expect(toastError).toHaveBeenCalledWith("Couldn't add video");
		} finally {
			vi.useRealTimers();
		}
	});

	it("stops reconciling once the uploads are destroyed", async () => {
		vi.useFakeTimers();
		vi.mocked(uploadAlbumContent).mockRejectedValue(httpError(502));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		try {
			enqueue(uploads, pick("a", "image/jpeg"));
			await vi.advanceTimersByTimeAsync(5_000);
			uploads.destroy();
			vi.mocked(getMyAlbums).mockClear();
			await vi.advanceTimersByTimeAsync(60_000);

			expect(getMyAlbums).not.toHaveBeenCalled();
			expect(toastError).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("stops uploading a kind the album has no room for", async () => {
		vi.mocked(uploadAlbumContent).mockRejectedValue(httpError(402));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		enqueue(uploads, pick("a", "image/jpeg"), pick("b", "image/jpeg"));
		await vi.waitFor(() =>
			expect(uploads.hasPending(ALBUM_ID)).toBe(false),
		);

		expect(uploadAlbumContent).toHaveBeenCalledTimes(1);
		expect(toastError).toHaveBeenCalledWith(
			"This album already holds 3 photos",
		);
	});

	it("names a one-video limit in the singular", async () => {
		vi.mocked(uploadAlbumContent).mockRejectedValue(httpError(402));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		enqueue(uploads, pick("a", "video/mp4"));
		await vi.waitFor(() => expect(toastError).toHaveBeenCalled());

		expect(toastError).toHaveBeenCalledWith(
			"This album already holds 1 video",
		);
	});

	it("reports a refused upload without reconciling", async () => {
		vi.mocked(uploadAlbumContent).mockRejectedValue(httpError(400));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		enqueue(uploads, pick("a", "image/jpeg"));
		await vi.waitFor(() => expect(toastError).toHaveBeenCalled());

		expect(toastError).toHaveBeenCalledWith("Couldn't add photo");
		expect(getMyAlbums).not.toHaveBeenCalled();
	});

	it("names the size limit when the server refuses the body", async () => {
		vi.mocked(uploadAlbumContent).mockRejectedValue(httpError(413));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		enqueue(uploads, pick("a", "image/jpeg"));
		await vi.waitFor(() => expect(toastError).toHaveBeenCalled());

		expect(toastError).toHaveBeenCalledWith("Larger than the 120 MB limit");
		expect(getMyAlbums).not.toHaveBeenCalled();
	});

	it("stops uploading once the signed-in account changes", async () => {
		let finish: (value: {
			contentId: number;
			sha256: string;
		}) => void = () => {};
		vi.mocked(uploadAlbumContent).mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		enqueue(uploads, pick("a", "image/jpeg"), pick("b", "image/jpeg"));
		await vi.waitFor(() => expect(uploadAlbumContent).toHaveBeenCalled());
		const next = getAlbumUploads(OUR_PROFILE_ID + 1);

		expect(next).not.toBe(uploads);
		expect(uploads.hasPending(ALBUM_ID)).toBe(false);

		finish({ contentId: 7, sha256: "c".repeat(64) });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(uploadAlbumContent).toHaveBeenCalledTimes(1);
		expect(uploadAlbumContent).toHaveBeenCalledWith(
			expect.objectContaining({ profileId: OUR_PROFILE_ID }),
		);
		expect(getAlbumContent).not.toHaveBeenCalled();
		expect(draft.land).not.toHaveBeenCalled();
	});

	it("keeps one uploads state per account until sign-out", () => {
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		expect(getAlbumUploads(OUR_PROFILE_ID)).toBe(uploads);

		clearAccountCaches();

		expect(getAlbumUploads(OUR_PROFILE_ID)).not.toBe(uploads);
	});

	it("refuses new uploads once destroyed", () => {
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		uploads.destroy();

		enqueue(uploads, pick("a", "image/jpeg"));

		expect(uploads.hasPending(ALBUM_ID)).toBe(false);
		expect(uploadAlbumContent).not.toHaveBeenCalled();
	});

	it.each(["SessionCleared", "NotSignedIn"] as const)(
		"drops the queue once the session is gone (%s)",
		async (kind) => {
			vi.mocked(uploadAlbumContent).mockRejectedValue(
				new ApiError({
					message: "Signed out",
					request: { method: "POST", path: "/v1/albums" },
					kind,
				}),
			);
			const uploads = getAlbumUploads(OUR_PROFILE_ID);

			enqueue(uploads, pick("a", "image/jpeg"), pick("b", "image/jpeg"));
			await vi.waitFor(() =>
				expect(uploads.hasPending(ALBUM_ID)).toBe(false),
			);

			expect(uploadAlbumContent).toHaveBeenCalledTimes(1);
			expect(getMyAlbums).not.toHaveBeenCalled();
			expect(toastError).not.toHaveBeenCalled();
		},
	);

	it("names the size limit when the backend refuses the file as too large", async () => {
		vi.mocked(uploadAlbumContent).mockRejectedValue(
			new ApiError({
				message: "Too large",
				request: { method: "POST", path: "/v1/albums" },
				kind: "ContentTooLarge",
			}),
		);
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		enqueue(uploads, pick("a", "video/mp4"));
		await vi.waitFor(() => expect(toastError).toHaveBeenCalled());

		expect(toastError).toHaveBeenCalledWith("Larger than the 120 MB limit");
		expect(getMyAlbums).not.toHaveBeenCalled();
	});

	it("replaces a video the server finished processing", async () => {
		vi.useFakeTimers();
		vi.mocked(uploadAlbumContent).mockResolvedValue({
			contentId: 7,
			sha256: "d".repeat(64),
		});
		vi.mocked(getAlbumContent)
			.mockResolvedValueOnce(albumWith(videoItem(7, true)))
			.mockResolvedValue(albumWith(videoItem(7, false)));
		vi.mocked(getAlbumContentProcessing)
			.mockResolvedValueOnce({ processing: true })
			.mockResolvedValue({ processing: false });
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		try {
			enqueue(uploads, pick("a", "video/mp4"));
			await vi.advanceTimersByTimeAsync(5_000);

			expect(draft.land).toHaveBeenCalledWith(videoItem(7, true));
			expect(draft.replace).toHaveBeenCalledWith(videoItem(7, false));
			expect(forgetAlbumSlides).toHaveBeenCalledWith(ALBUM_ID);
		} finally {
			vi.useRealTimers();
		}
	});

	it("retries the album read after processing finishes", async () => {
		vi.useFakeTimers();
		vi.mocked(uploadAlbumContent).mockResolvedValue({
			contentId: 7,
			sha256: "d".repeat(64),
		});
		vi.mocked(getAlbumContent)
			.mockResolvedValueOnce(albumWith(videoItem(7, true)))
			.mockRejectedValueOnce(httpError(500))
			.mockResolvedValue(albumWith(videoItem(7, false)));
		vi.mocked(getAlbumContentProcessing).mockResolvedValue({
			processing: false,
		});
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		try {
			enqueue(uploads, pick("a", "video/mp4"));
			await vi.advanceTimersByTimeAsync(2_500);

			expect(draft.land).toHaveBeenCalledWith(videoItem(7, true));
			expect(draft.replace).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(6_000);

			expect(draft.replace).toHaveBeenCalledWith(videoItem(7, false));
			expect(toastSuccess).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("forgets a processing video the server no longer has", async () => {
		vi.useFakeTimers();
		vi.mocked(uploadAlbumContent).mockResolvedValue({
			contentId: 7,
			sha256: "e".repeat(64),
		});
		vi.mocked(getAlbumContent).mockResolvedValue(
			albumWith(videoItem(7, true)),
		);
		vi.mocked(getAlbumContentProcessing).mockRejectedValue(httpError(404));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		try {
			enqueue(uploads, pick("a", "video/mp4"));
			await vi.advanceTimersByTimeAsync(5_000);

			expect(draft.forget).toHaveBeenCalledWith(7);
			expect(draft.replace).not.toHaveBeenCalled();
			expect(getAlbumContentProcessing).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("gives up on a video that never finishes processing", async () => {
		vi.useFakeTimers();
		vi.mocked(uploadAlbumContent).mockResolvedValue({
			contentId: 7,
			sha256: "f".repeat(64),
		});
		vi.mocked(getAlbumContent).mockResolvedValue(
			albumWith(videoItem(7, true)),
		);
		vi.mocked(getAlbumContentProcessing).mockResolvedValue({
			processing: true,
		});
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const draft = draftSpy();
		uploads.attachDraft({ albumId: ALBUM_ID, draft });

		try {
			enqueue(uploads, pick("a", "video/mp4"));
			await vi.advanceTimersByTimeAsync(2_500 * 130);

			expect(getAlbumContentProcessing).toHaveBeenCalledTimes(120);
			expect(draft.replace).not.toHaveBeenCalled();
			expect(draft.forget).not.toHaveBeenCalled();
			expect(toastError).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
