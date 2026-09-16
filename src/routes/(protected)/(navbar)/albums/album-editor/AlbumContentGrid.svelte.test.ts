// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { albumProcessingPlaceholderUrl } from "$lib/demo/mock/albums";
import type { AlbumContent } from "$lib/model/messaging/albums";
import AlbumContentGrid from "./AlbumContentGrid.svelte";

const readyPhoto: AlbumContent = {
	contentId: 1,
	contentType: "image/jpeg",
	coverUrl: "https://example.invalid/1/cover",
	statusId: 1,
	thumbUrl: "https://example.invalid/1/thumb",
	url: "https://example.invalid/1",
	processing: false,
	rejectionId: null,
};

const processingVideo: AlbumContent = {
	contentId: 2,
	contentType: "video/mp4",
	coverUrl: albumProcessingPlaceholderUrl,
	statusId: 3,
	thumbUrl: albumProcessingPlaceholderUrl,
	url: albumProcessingPlaceholderUrl,
	processing: true,
	rejectionId: null,
};

function cells(container: HTMLElement): HTMLElement[] {
	return [
		...container.querySelectorAll<HTMLElement>(
			'[data-slot="media-slot-cell"]',
		),
	];
}

afterEach(() => cleanup());

describe("album content grid", () => {
	it("shows a processing item as pending media instead of the placeholder media, keeping Remove", () => {
		const { container, getByRole } = render(AlbumContentGrid, {
			props: {
				content: [processingVideo, readyPhoto],
				removed: [],
				saving: false,
				onToggleRemoved: () => {},
				onReorder: () => {},
			},
		});

		const [processingCell, readyCell] = cells(container);
		const pending = processingCell?.querySelector(
			'[data-slot="media-image-pending"]',
		);
		expect(pending?.getAttribute("aria-label")).toBe(
			"Album video in slot 1, processing",
		);
		expect(processingCell?.querySelector("img")).toBeNull();
		expect(
			readyCell?.querySelector('[data-slot="media-image-pending"]'),
		).toBeNull();
		expect(readyCell?.querySelector("img")).not.toBeNull();
		expect(
			getByRole("button", { name: "Remove album video in slot 1" }),
		).toBeTruthy();
	});

	it("names every item and its remove toggle by the slot it sits in", () => {
		const { getByRole } = render(AlbumContentGrid, {
			props: {
				content: [readyPhoto, processingVideo],
				removed: [processingVideo.contentId],
				saving: false,
				onToggleRemoved: () => {},
				onReorder: () => {},
			},
		});

		expect(
			getByRole("img", { name: "Album photo in slot 1" }),
		).toBeTruthy();
		expect(
			getByRole("img", { name: "Album video in slot 2, processing" }),
		).toBeTruthy();
		expect(
			getByRole("button", { name: "Remove album photo in slot 1" }),
		).toBeTruthy();
		expect(
			getByRole("button", { name: "Keep album video in slot 2" }),
		).toBeTruthy();
	});
});
