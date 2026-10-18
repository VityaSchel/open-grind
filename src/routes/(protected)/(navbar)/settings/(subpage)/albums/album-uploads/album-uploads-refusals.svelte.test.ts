import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccountCaches } from "$lib/api/account-caches";
import { ApiError } from "$lib/api/api-error";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import type { PickedMedia } from "$lib/platform/media-picker";
import { getAlbumUploads } from "./album-uploads-state.svelte";
import {
	ALBUM_ID,
	enqueue,
	httpError,
	limits,
	OUR_PROFILE_ID,
	pick,
} from "./album-uploads-test-helpers";

const { toastError, discardStagedMedia } = vi.hoisted(() => ({
	toastError: vi.fn(),
	discardStagedMedia: vi.fn<(media: PickedMedia[]) => Promise<void>>(),
}));

vi.mock("svelte-sonner", () => ({
	toast: { error: toastError, success: vi.fn() },
}));

vi.mock("$lib/platform/media-file", async (importOriginal) => ({
	...(await importOriginal<object>()),
	discardStagedMedia,
}));

vi.mock("$lib/api/messaging/albums", async (importOriginal) => ({
	...(await importOriginal<object>()),
	getMyAlbums: vi.fn(),
	uploadAlbumContent: vi.fn(),
}));

vi.mock("$lib/components/album/album-lightbox", () => ({
	forgetAlbumSlides: vi.fn(),
}));

const { getMyAlbums, uploadAlbumContent } =
	await import("$lib/api/messaging/albums");

vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
	vi.clearAllMocks();
	clearAccountCaches();
});

afterEach(async () => {
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("album upload refusals", () => {
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

	it("discards the copies it gives up on, never the one uploading", async () => {
		vi.mocked(uploadAlbumContent)
			.mockRejectedValueOnce(httpError(402))
			.mockReturnValue(new Promise(() => {}));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);
		const discarded = () =>
			discardStagedMedia.mock.calls.flat(2).map(({ key }) => key);

		enqueue(uploads, pick("a", "image/jpeg"), pick("b", "image/jpeg"));
		enqueue(uploads, pick("c", "video/mp4"));
		await vi.waitFor(() =>
			expect(uploadAlbumContent).toHaveBeenCalledTimes(2),
		);
		expect(discarded()).toEqual(["b"]);

		enqueue(uploads, pick("e", "image/jpeg"));
		uploads.destroy();

		expect(discarded()).toEqual(["b", "e"]);
	});

	it("keeps uploading a queued video after the album refuses a photo", async () => {
		vi.mocked(uploadAlbumContent)
			.mockRejectedValueOnce(httpError(402))
			.mockReturnValue(new Promise(() => {}));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		enqueue(uploads, pick("a", "image/jpeg"));
		enqueue(uploads, pick("b", "video/mp4"));
		await vi.waitFor(() =>
			expect(uploadAlbumContent).toHaveBeenCalledTimes(2),
		);

		expect(vi.mocked(uploadAlbumContent).mock.calls[1]?.[0]).toMatchObject({
			inspection: { kind: "video" },
		});
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

		expect(toastError).toHaveBeenCalledWith("Couldn’t add photo");
		expect(getMyAlbums).not.toHaveBeenCalled();
	});

	it("names the size limit when the server refuses the body", async () => {
		vi.mocked(uploadAlbumContent).mockRejectedValue(httpError(413));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		enqueue(uploads, pick("a", "image/jpeg"));
		await vi.waitFor(() => expect(toastError).toHaveBeenCalled());

		expect(toastError).toHaveBeenCalledWith(
			"Larger than the 120.00 MB limit",
		);
		expect(getMyAlbums).not.toHaveBeenCalled();
	});

	it("formats the size limit from its bytes in the active locale", async () => {
		await setLocale({ locale: "en-XA" });
		vi.mocked(uploadAlbumContent).mockRejectedValue(httpError(413));
		const uploads = getAlbumUploads(OUR_PROFILE_ID);

		uploads.enqueue({
			albumId: ALBUM_ID,
			inspected: [pick("a", "image/jpeg")],
			limits: { ...limits, maxContentSize: 52_428_800 },
			content: [],
		});
		await vi.waitFor(() => expect(toastError).toHaveBeenCalled());

		const [message] = toastError.mock.calls.at(-1) ?? [];
		expect(message).toMatch(PSEUDO_MESSAGE);
		expect(message).toContain("⟦50.00 MB⟧");
	});

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

		expect(toastError).toHaveBeenCalledWith(
			"Larger than the 120.00 MB limit",
		);
		expect(getMyAlbums).not.toHaveBeenCalled();
	});
});
