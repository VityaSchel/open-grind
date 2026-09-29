import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getAlbumContent: vi.fn() }));
const dimensions = vi.hoisted(() => ({
	measureImage: vi.fn(),
	measureVideo: vi.fn(),
}));

const failures = vi.hoisted(() => ({ mediaFailure: vi.fn() }));

vi.mock("$lib/api/messaging/albums", () => api);
vi.mock("$lib/platform/media-failure", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/media-failure")>()),
	...failures,
}));
vi.mock("$lib/util/media-dimensions", () => dimensions);
vi.mock("$lib/util/photoswipe", () => ({}));

import { albumProcessingPlaceholderUrl } from "$lib/demo/mock/albums";
import {
	albumPhotoRenewal,
	forgetAlbumSlides,
	loadAlbumSlides,
} from "./album-lightbox";

const ALBUM_ID = 900;

function readyItem({
	contentId,
	contentType,
}: {
	contentId: number;
	contentType: string;
}) {
	const media = `https://example.invalid/${contentId}`;
	return {
		contentId,
		contentType,
		coverUrl: media,
		statusId: 1,
		thumbUrl: media,
		url: media,
		processing: false,
		rejectionId: null,
	};
}

function processingVideo(contentId: number) {
	return {
		contentId,
		contentType: "video/mp4",
		coverUrl: albumProcessingPlaceholderUrl,
		statusId: 3,
		thumbUrl: albumProcessingPlaceholderUrl,
		url: albumProcessingPlaceholderUrl,
		processing: true,
		rejectionId: null,
	};
}

function serveAlbum(content: unknown[]) {
	api.getAlbumContent.mockResolvedValue({ albumId: ALBUM_ID, content });
}

beforeEach(() => {
	forgetAlbumSlides(ALBUM_ID);
	api.getAlbumContent.mockReset();
	dimensions.measureImage.mockReset();
	dimensions.measureVideo.mockReset();
	dimensions.measureImage.mockResolvedValue({ width: 300, height: 400 });
	dimensions.measureVideo.mockResolvedValue({ width: 720, height: 1280 });
	failures.mediaFailure.mockReset();
});

describe("loadAlbumSlides", () => {
	it("opens a photo album without downloading a photo", async () => {
		serveAlbum(
			[1, 2, 3].map((contentId) =>
				readyItem({ contentId, contentType: "image/jpeg" }),
			),
		);

		const slides = await loadAlbumSlides(ALBUM_ID);

		expect(dimensions.measureImage).not.toHaveBeenCalled();
		expect(dimensions.measureVideo).not.toHaveBeenCalled();
		expect(slides.map(({ width, height }) => [width, height])).toEqual([
			[0, 0],
			[0, 0],
			[0, 0],
		]);
	});

	it("leaves out items that are still processing and never measures the placeholder", async () => {
		serveAlbum([
			readyItem({ contentId: 1, contentType: "image/jpeg" }),
			processingVideo(2),
			readyItem({ contentId: 3, contentType: "video/mp4" }),
		]);

		const slides = await loadAlbumSlides(ALBUM_ID);

		expect(slides.map((slide) => slide.contentId)).toEqual([1, 3]);
		const measured = [
			...dimensions.measureImage.mock.calls,
			...dimensions.measureVideo.mock.calls,
		].map(([url]) => url);
		expect(measured).not.toContain(albumProcessingPlaceholderUrl);
	});

	it("opens an album whose video has no plays left by measuring its thumbnail", async () => {
		const playedOut = {
			...readyItem({ contentId: 2, contentType: "video/mp4" }),
			coverUrl: null,
			url: "",
		};
		serveAlbum([
			readyItem({ contentId: 1, contentType: "image/jpeg" }),
			playedOut,
		]);

		const slides = await loadAlbumSlides(ALBUM_ID);

		expect(slides.map((slide) => slide.contentId)).toEqual([1, 2]);
		expect(dimensions.measureVideo).not.toHaveBeenCalled();
		expect(dimensions.measureImage).toHaveBeenCalledWith(
			playedOut.thumbUrl,
		);
	});

	it("opens the album even when a video cover cannot be measured", async () => {
		serveAlbum([
			readyItem({ contentId: 1, contentType: "video/mp4" }),
			readyItem({ contentId: 2, contentType: "video/mp4" }),
		]);
		dimensions.measureImage.mockRejectedValueOnce(new Error("gone"));

		const slides = await loadAlbumSlides(ALBUM_ID);

		expect(slides.map(({ width, height }) => [width, height])).toEqual([
			[1080, 1080],
			[300, 400],
		]);
	});

	it("refetches an album that had processing items instead of caching the partial slides", async () => {
		serveAlbum([
			readyItem({ contentId: 1, contentType: "image/jpeg" }),
			processingVideo(2),
		]);

		await loadAlbumSlides(ALBUM_ID);
		await loadAlbumSlides(ALBUM_ID);

		expect(api.getAlbumContent).toHaveBeenCalledTimes(2);
	});

	it("serves a fully ready album from the cache", async () => {
		serveAlbum([readyItem({ contentId: 1, contentType: "image/jpeg" })]);

		await loadAlbumSlides(ALBUM_ID);
		await loadAlbumSlides(ALBUM_ID);

		expect(api.getAlbumContent).toHaveBeenCalledTimes(1);
	});

	it("does not cache slides whose album was forgotten while they were measured", async () => {
		serveAlbum([readyItem({ contentId: 1, contentType: "video/mp4" })]);
		let finishMeasuring!: (dimensions: {
			width: number;
			height: number;
		}) => void;
		dimensions.measureImage.mockReturnValueOnce(
			new Promise((resolve) => (finishMeasuring = resolve)),
		);

		const loading = loadAlbumSlides(ALBUM_ID);
		await vi.waitFor(() =>
			expect(dimensions.measureImage).toHaveBeenCalled(),
		);
		forgetAlbumSlides(ALBUM_ID);
		finishMeasuring({ width: 300, height: 400 });
		await loading;
		await loadAlbumSlides(ALBUM_ID);

		expect(api.getAlbumContent).toHaveBeenCalledTimes(2);
	});
});

describe("albumPhotoRenewal", () => {
	const refused = {
		kind: "status",
		status: 403,
		phase: null,
		host: "d3w4wp6rol9nvz.cloudfront.net",
		signatureExpired: true,
	};

	async function openedAlbum(content: ReturnType<typeof readyItem>[]) {
		serveAlbum(content);
		const slides = await loadAlbumSlides(ALBUM_ID);
		const items = slides.map(({ url, width, height }) => ({
			src: url,
			width,
			height,
		}));
		return { slides, items };
	}

	it("renews a refused photo once and points it at the new url", async () => {
		const photo = readyItem({ contentId: 1, contentType: "image/jpeg" });
		const { slides, items } = await openedAlbum([photo]);
		failures.mediaFailure.mockResolvedValue(refused);
		serveAlbum([{ ...photo, url: `${photo.url}?renewed` }]);
		const renew = albumPhotoRenewal({ albumId: ALBUM_ID, slides, items });
		const refresh = vi.fn();

		await renew({ index: 0, refresh });
		await renew({ index: 0, refresh });

		expect(items[0]?.src).toBe(`${photo.url}?renewed`);
		expect(refresh).toHaveBeenCalledOnce();
		expect(api.getAlbumContent).toHaveBeenCalledTimes(2);
	});

	it("leaves a photo alone that failed for another reason", async () => {
		const { slides, items } = await openedAlbum([
			readyItem({ contentId: 1, contentType: "image/jpeg" }),
		]);
		failures.mediaFailure.mockResolvedValue({
			...refused,
			kind: "transport",
			status: null,
			signatureExpired: false,
		});
		const refresh = vi.fn();

		await albumPhotoRenewal({ albumId: ALBUM_ID, slides, items })({
			index: 0,
			refresh,
		});

		expect(refresh).not.toHaveBeenCalled();
		expect(api.getAlbumContent).toHaveBeenCalledOnce();
	});

	it("never renews a video slide", async () => {
		const { slides, items } = await openedAlbum([
			readyItem({ contentId: 1, contentType: "video/mp4" }),
		]);
		const refresh = vi.fn();

		await albumPhotoRenewal({ albumId: ALBUM_ID, slides, items })({
			index: 0,
			refresh,
		});

		expect(failures.mediaFailure).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
	});
});
