import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getAlbumContent: vi.fn() }));
const dimensions = vi.hoisted(() => ({
	measureImage: vi.fn(),
	measureVideo: vi.fn(),
}));

vi.mock("$lib/api/messaging/albums", () => api);
vi.mock("$lib/util/media-dimensions", () => dimensions);
vi.mock("$lib/util/photoswipe", () => ({}));

import { albumProcessingPlaceholderUrl } from "$lib/demo/mock/albums";
import { forgetAlbumSlides, loadAlbumSlides } from "./album-lightbox";

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
});

describe("loadAlbumSlides", () => {
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
		serveAlbum([readyItem({ contentId: 1, contentType: "image/jpeg" })]);
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
