import { afterEach, describe, expect, it } from "vitest";

import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import {
	albumCoverContent,
	albumDisplayName,
	albumItemCountLabel,
	albumUpdatedLabel,
	isVideoContent,
	readyAlbumMedia,
} from "./album";

afterEach(() => resetNowForTesting());

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

describe("albumUpdatedLabel", () => {
	it("omits the year within the current year", () => {
		setNowForTesting(() => new Date("2026-12-31T23:00:00").getTime());
		expect(albumUpdatedLabel("2026-09-09T14:03:11")).toBe("Sep 9");
	});

	it("spells out the year for an earlier one", () => {
		setNowForTesting(() => new Date("2026-01-01T00:30:00").getTime());
		expect(albumUpdatedLabel("2025-08-26T10:00:00")).toBe("Aug 26, 2025");
	});
});

describe("isVideoContent", () => {
	it("splits video from image content types", () => {
		expect(isVideoContent("video/mp4")).toBe(true);
		expect(isVideoContent("image/jpeg")).toBe(false);
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
