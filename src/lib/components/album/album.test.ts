import { describe, expect, it } from "vitest";

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

describe("albumDisplayName", () => {
	it("falls back for an unnamed album", () => {
		expect(albumDisplayName(null)).toBe("Untitled album");
		expect(albumDisplayName("")).toBe("Untitled album");
	});

	it("keeps a real name", () => {
		expect(albumDisplayName("Studio")).toBe("Studio");
	});
});

describe("albumItemCountLabel", () => {
	it("agrees in number with the count", () => {
		expect(albumItemCountLabel(0)).toBe("0 items");
		expect(albumItemCountLabel(1)).toBe("1 item");
		expect(albumItemCountLabel(4)).toBe("4 items");
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
