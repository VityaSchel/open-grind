// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/components/album/album-lightbox", () => ({
	loadAlbumSlides: vi.fn(),
	openAlbumLightbox: vi.fn(),
}));

import { albumProcessingPlaceholderUrl } from "$lib/demo/mock/albums";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import {
	bracketCounts,
	restoreCountFormatter,
} from "$lib/i18n/fixtures/count-formatter";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import type { AlbumContent } from "$lib/model/messaging/albums";
import type { UploadLimits } from "../album-uploads/album-uploads-state.svelte";
import AlbumEditorHeader from "./AlbumEditorHeader.svelte";

const limits: UploadLimits = {
	maxContentSize: 10_000_000,
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

const HEADER_PROPS = {
	albumId: 900,
	albumName: "Studio",
	content: [],
	pending: [],
	limits: null,
	sharedCount: 0,
	updatedAt: "2026-09-01T10:00:00",
	onOpenShares: () => {},
};

const readyPhotoAndVideo = [
	item({ contentId: 1, processing: false, contentType: "image/jpeg" }),
	item({ contentId: 2, processing: false }),
];

function previewAreaOf(content: AlbumContent[]): string {
	const { container } = render(AlbumEditorHeader, {
		props: { ...HEADER_PROPS, content },
	});
	const area = container.querySelector('[data-slot="album-header-preview"]');
	if (area === null) throw new Error("no preview area");
	return area.outerHTML;
}

afterEach(async () => {
	cleanup();
	resetNowForTesting();
	restoreCountFormatter();
	await setLocale({ locale: SOURCE_LOCALE });
});

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
		const props = { ...HEADER_PROPS, content: readyPhotoAndVideo };

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
				...HEADER_PROPS,
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
			},
		});

		expect(getByText("2/10 photos, 1/1 videos")).toBeTruthy();
	});

	it("prints the media usage and the share count with the count formatter", () => {
		const bracketed = bracketCounts();
		const { getByRole, getByText } = render(AlbumEditorHeader, {
			props: {
				...HEADER_PROPS,
				content: readyPhotoAndVideo,
				limits,
				sharedCount: 13,
			},
		});

		expect(getByText("[1]/[10] photos, [1]/[1] videos")).toBeTruthy();
		expect(
			getByRole("button", { name: /^Shared with/ }).textContent,
		).toContain(bracketed(13));
	});

	it("says when the album was last updated", () => {
		setNowForTesting(() => new Date("2026-10-11T12:00:00").getTime());
		const { getByText } = render(AlbumEditorHeader, {
			props: HEADER_PROPS,
		});

		expect(getByText("Updated Sep 1")).toBeTruthy();
	});

	it("names the album name field after what it holds", () => {
		const { getByRole } = render(AlbumEditorHeader, {
			props: HEADER_PROPS,
		});

		const field = getByRole("textbox", {
			name: "Album name",
			description: "Only you see the album name",
		});
		expect(field.getAttribute("placeholder")).toBe("Album name");
	});

	it("words its labels, update date and media usage in the active locale", async () => {
		setNowForTesting(() => new Date("2026-10-11T12:00:00").getTime());
		const { getByRole, getByText } = render(AlbumEditorHeader, {
			props: { ...HEADER_PROPS, content: readyPhotoAndVideo, limits },
		});
		const updated = getByText("Updated Sep 1");
		const usage = getByText("1/10 photos, 1/1 videos");
		const sharedWith = getByText("Shared with");
		const preview = getByRole("button", { name: "Preview album" });
		const field = getByRole("textbox", { name: "Album name" });

		await setLocale({ locale: "en-XA" });

		expect(updated.textContent).toMatch(PSEUDO_MESSAGE);
		expect(updated.textContent).toContain("⟦Sep 1⟧");
		expect(usage.textContent).toMatch(PSEUDO_MESSAGE);
		expect(usage.textContent).toContain("1/10");
		expect(sharedWith.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		expect(preview.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
		expect(
			getByRole("textbox", {
				name: PSEUDO_MESSAGE,
				description: PSEUDO_MESSAGE,
			}),
		).toBe(field);
		expect(field.getAttribute("placeholder")).toBe(
			field.getAttribute("aria-label"),
		);
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
