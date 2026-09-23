// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/components/album/album-lightbox", () => ({
	loadAlbumSlides: vi.fn(),
	openAlbumLightbox: vi.fn(),
}));

import { albumProcessingPlaceholderUrl } from "$lib/demo/mock/albums";
import type { AlbumContent } from "$lib/model/messaging/albums";
import type { UploadLimits } from "../album-uploads/album-uploads-state.svelte";
import AlbumEditorHeader from "./AlbumEditorHeader.svelte";

const limits: UploadLimits = {
	maxContentSize: 10_000_000,
	maxContentSizeHumanReadable: "10 MB",
	maxContentItemsPerAlbum: 10,
	maxVideosPerAlbum: 1,
};

function item({
	contentId,
	processing,
	contentType = "video/mp4",
}: {
	contentId: number;
	processing: boolean;
	contentType?: string;
}): AlbumContent {
	const media = processing
		? albumProcessingPlaceholderUrl
		: `https://example.invalid/${contentId}`;
	return {
		contentId,
		contentType,
		coverUrl: media,
		statusId: processing ? 3 : 1,
		thumbUrl: media,
		url: media,
		processing,
		rejectionId: null,
	};
}

function previewAreaOf(content: AlbumContent[]): string {
	const { container } = render(AlbumEditorHeader, {
		props: {
			albumId: 900,
			albumName: "Studio",
			content,
			pending: [],
			limits: null,
			sharedCount: 0,
			updatedAt: "2026-09-01T10:00:00",
			onOpenShares: () => {},
		},
	});
	const area = container.querySelector('[data-slot="album-header-preview"]');
	if (area === null) throw new Error("no preview area");
	return area.outerHTML;
}

afterEach(() => cleanup());

describe("album editor header", () => {
	it("shows the empty album placeholder while every item is processing", () => {
		const processing = previewAreaOf([
			item({ contentId: 1, processing: true }),
			item({ contentId: 2, processing: true }),
		]);
		const empty = previewAreaOf([]);

		expect(empty).toContain('data-slot="empty-media"');
		expect(empty).not.toContain('data-slot="broken-media"');
		expect(processing).toBe(empty);
	});

	it("offers the album preview once any item is ready", () => {
		const area = previewAreaOf([
			item({ contentId: 1, processing: true }),
			item({ contentId: 2, processing: false }),
		]);

		expect(area).toContain('data-slot="album-preview"');
		expect(area).not.toContain('data-slot="empty-media"');
	});

	it("counts photos and videos against their own limits once known", () => {
		const props = {
			albumId: 900,
			albumName: "Studio",
			content: [
				item({
					contentId: 1,
					processing: false,
					contentType: "image/jpeg",
				}),
				item({ contentId: 2, processing: false }),
			],
			pending: [],
			limits: null,
			sharedCount: 0,
			updatedAt: "2026-09-01T10:00:00",
			onOpenShares: () => {},
		};

		const unknown = render(AlbumEditorHeader, { props });
		expect(unknown.getByText("2 items")).toBeTruthy();
		cleanup();

		const known = render(AlbumEditorHeader, {
			props: { ...props, limits },
		});
		expect(known.getByText("1/10 photos, 1/1 videos")).toBeTruthy();
	});

	it("counts uploads in flight against the limits", () => {
		const { getByText } = render(AlbumEditorHeader, {
			props: {
				albumId: 900,
				albumName: "Studio",
				content: [
					item({
						contentId: 1,
						processing: false,
						contentType: "image/jpeg",
					}),
				],
				pending: [
					{ key: "a", kind: "photo" },
					{ key: "b", kind: "video" },
				],
				limits,
				sharedCount: 0,
				updatedAt: "2026-09-01T10:00:00",
				onOpenShares: () => {},
			},
		});

		expect(getByText("2/10 photos, 1/1 videos")).toBeTruthy();
	});

	it("badges the preview only with kinds that are ready to show", () => {
		const area = previewAreaOf([
			item({ contentId: 1, processing: true, contentType: "video/mp4" }),
			item({
				contentId: 2,
				processing: false,
				contentType: "image/jpeg",
			}),
		]);

		expect(area).toContain('data-slot="album-preview-photo-badge"');
		expect(area).not.toContain('data-slot="album-preview-video-badge"');
	});
});
