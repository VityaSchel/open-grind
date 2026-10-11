import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import {
	bracketCounts,
	restoreCountFormatter,
} from "$lib/i18n/fixtures/count-formatter";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import {
	albumCoverContent,
	albumDisplayName,
	albumItemCountLabel,
	albumMediaCounts,
	albumRoom,
	hasNoPlaysLeft,
	isVideoContent,
	readyAlbumMedia,
} from "./album";

afterEach(async () => {
	restoreCountFormatter();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("albumDisplayName", () => {
	it("falls back for an unnamed album", () => {
		expect(albumDisplayName(null)).toBe("Untitled Album");
		expect(albumDisplayName("")).toBe("Untitled Album");
	});

	it("keeps a real name", () => {
		expect(albumDisplayName("Studio")).toBe("Studio");
	});

	it("words the fallback in the active locale but never a real name", async () => {
		await setLocale({ locale: "en-XA" });

		expect(albumDisplayName(null)).toMatch(PSEUDO_MESSAGE);
		expect(albumDisplayName("Studio")).toBe("Studio");
	});
});

describe("albumItemCountLabel", () => {
	it("agrees in number with the count", () => {
		expect(albumItemCountLabel(0)).toBe("0 items");
		expect(albumItemCountLabel(1)).toBe("1 item");
		expect(albumItemCountLabel(4)).toBe("4 items");
	});

	it("prints the count with the count formatter", () => {
		const bracketed = bracketCounts();

		expect(albumItemCountLabel(1)).toBe(`${bracketed(1)} item`);
		expect(albumItemCountLabel(1200)).toBe(`${bracketed(1200)} items`);
	});

	it("words the count in the active locale", async () => {
		await setLocale({ locale: "en-XA" });

		expect(albumItemCountLabel(1)).toMatch(PSEUDO_MESSAGE);
		expect(albumItemCountLabel(4)).toMatch(PSEUDO_MESSAGE);
		expect(albumItemCountLabel(4)).toContain("4");
	});
});

describe("isVideoContent", () => {
	it("splits video from image content types", () => {
		expect(isVideoContent("video/mp4")).toBe(true);
		expect(isVideoContent("image/jpeg")).toBe(false);
	});
});

describe("albumRoom", () => {
	const photo = { contentType: "image/jpeg" };
	const video = { contentType: "video/mp4" };
	const limits = { maxContentItemsPerAlbum: 2, maxVideosPerAlbum: 1 };

	it("keeps the video slot open once every photo slot is taken", () => {
		expect(
			albumRoom({ content: [photo, photo], pending: [], limits }),
		).toEqual({ photos: false, videos: true });
	});

	it("keeps photo slots open once the video slot is taken", () => {
		expect(
			albumRoom({ content: [photo, video], pending: [], limits }),
		).toEqual({ photos: true, videos: false });
	});

	it("has no room once every photo and video slot is taken", () => {
		expect(
			albumRoom({ content: [photo, photo, video], pending: [], limits }),
		).toEqual({ photos: false, videos: false });
	});

	it("counts uploads in flight against their own slots", () => {
		expect(
			albumRoom({
				content: [photo],
				pending: [{ kind: "photo" }, { kind: "video" }],
				limits,
			}),
		).toEqual({ photos: false, videos: false });
	});
});

describe("albumMediaCounts", () => {
	const photo = { contentType: "image/jpeg" };
	const video = { contentType: "video/mp4" };

	it("counts the album's photos and videos apart", () => {
		expect(
			albumMediaCounts({ content: [photo, video, photo], pending: [] }),
		).toEqual({ photos: 2, videos: 1 });
	});

	it("counts uploads in flight with the kind they will land as", () => {
		expect(
			albumMediaCounts({
				content: [photo],
				pending: [
					{ kind: "video" },
					{ kind: "photo" },
					{ kind: "photo" },
				],
			}),
		).toEqual({ photos: 3, videos: 1 });
	});
});

describe("hasNoPlaysLeft", () => {
	it("is a video the server sent without a url", () => {
		expect(hasNoPlaysLeft({ contentType: "video/mp4", url: "" })).toBe(
			true,
		);
	});

	it("is never a video with a url or a photo", () => {
		expect(
			hasNoPlaysLeft({
				contentType: "video/mp4",
				url: "https://a.invalid",
			}),
		).toBe(false);
		expect(hasNoPlaysLeft({ contentType: "image/jpeg", url: "" })).toBe(
			false,
		);
	});
});

describe("albumCoverContent", () => {
	const processing = { contentId: 1, processing: true };
	const ready = { contentId: 2, processing: false };
	const laterReady = { contentId: 3, processing: false };

	it("skips items that are still processing", () => {
		expect(albumCoverContent([processing, ready, laterReady])).toBe(ready);
	});

	it("has no cover when every item is processing, the same as an empty album", () => {
		expect(albumCoverContent([processing, processing])).toBeUndefined();
		expect(albumCoverContent([])).toBeUndefined();
	});
});

describe("readyAlbumMedia", () => {
	const photo = { contentType: "image/jpeg", processing: false };
	const video = { contentType: "video/mp4", processing: false };
	const processingPhoto = { contentType: "image/jpeg", processing: true };
	const processingVideo = { contentType: "video/mp4", processing: true };

	it("counts and kinds only the items that are ready", () => {
		expect(readyAlbumMedia([photo, processingVideo, photo])).toEqual({
			count: 2,
			hasPhoto: true,
			hasVideo: false,
		});
		expect(readyAlbumMedia([processingPhoto, video])).toEqual({
			count: 1,
			hasPhoto: false,
			hasVideo: true,
		});
	});

	it("summarizes an all-processing album the same as an empty one", () => {
		expect(readyAlbumMedia([processingPhoto, processingVideo])).toEqual(
			readyAlbumMedia([]),
		);
		expect(readyAlbumMedia([])).toEqual({
			count: 0,
			hasPhoto: false,
			hasVideo: false,
		});
	});
});
