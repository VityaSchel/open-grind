// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { albumProcessingPlaceholderUrl } from "$lib/demo/mock/albums";
import type { AlbumContent } from "$lib/model/messaging/albums";
import type { PendingUpload } from "../album-uploads/album-uploads.svelte";
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
				albumId: 903,
				content: [processingVideo, readyPhoto],
				pending: [],
				removed: [],
				saving: false,
				maxPhotos: null,
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

	it("puts uploads in flight before the album, unremovable and unreorderable", () => {
		const { container, getByRole } = render(AlbumContentGrid, {
			props: {
				albumId: 903,
				content: [readyPhoto],
				pending: [
					{ key: "a", kind: "video" },
					{ key: "b", kind: "photo" },
				] satisfies PendingUpload[],
				removed: [],
				saving: false,
				maxPhotos: null,
				onToggleRemoved: () => {},
				onReorder: () => {},
			},
		});

		const [firstCell, secondCell, thirdCell] = cells(container);
		expect(
			firstCell?.querySelector('[data-slot="media-image-pending"]')
				?.ariaLabel,
		).toBe("Uploading video");
		expect(
			secondCell?.querySelector('[data-slot="media-image-pending"]')
				?.ariaLabel,
		).toBe("Uploading photo");
		expect(thirdCell?.querySelector("img")).not.toBeNull();
		expect(
			firstCell?.querySelector("button"),
			"an upload in flight carries no remove button",
		).toBeNull();
		expect(secondCell?.querySelector("button")).toBeNull();
		expect(thirdCell?.querySelector("button")).not.toBeNull();
		expect(
			getByRole("img", { name: "Album photo in slot 1" }),
		).toBeTruthy();
		const settled = render(AlbumContentGrid, {
			props: {
				albumId: 903,
				content: [readyPhoto, processingVideo],
				pending: [],
				removed: [],
				saving: false,
				maxPhotos: null,
				onToggleRemoved: () => {},
				onReorder: () => {},
			},
		});

		expect(
			cells(settled.container)[0]?.className,
			"two settled items reorder",
		).toContain("touch-callout");
		expect(
			firstCell?.className,
			"reordering is off while an upload is in flight",
		).not.toContain("touch-callout");
	});

	it("leads the grid with an add tile that is neither a slot nor reorderable", () => {
		const { container, getByRole } = render(AlbumContentGrid, {
			props: {
				albumId: 903,
				content: [readyPhoto],
				pending: [],
				removed: [],
				saving: false,
				maxPhotos: null,
				onToggleRemoved: () => {},
				onReorder: () => {},
			},
		});

		const grid = container.querySelector('[data-slot="media-slot-grid"]');
		const add = getByRole("button", { name: "Add photos or videos" });
		const leading = grid?.firstElementChild;
		expect(
			leading?.getAttribute("role"),
			"the list holds list items only",
		).toBe("listitem");
		expect(leading?.firstElementChild).toBe(add);
		expect(leading?.getAttribute("data-slot")).toBeNull();
		expect(add.closest('[data-slot="media-slot-cell"]')).toBeNull();
		expect(cells(container).length, "the add tile is not a slot").toBe(1);
		expect(
			getByRole("img", { name: "Album photo in slot 1" }),
			"the add tile does not shift slot numbering",
		).toBeTruthy();
	});

	it("disables adding while a save runs", () => {
		const { getByRole } = render(AlbumContentGrid, {
			props: {
				albumId: 903,
				content: [readyPhoto],
				pending: [],
				removed: [],
				saving: true,
				maxPhotos: null,
				onToggleRemoved: () => {},
				onReorder: () => {},
			},
		});

		expect(
			getByRole("button", { name: "Add photos or videos" }),
		).toHaveProperty("disabled", true);
	});

	it("stops adding once the album holds every photo it can", () => {
		const { container } = render(AlbumContentGrid, {
			props: {
				albumId: 903,
				content: [readyPhoto],
				pending: [
					{ key: "a", kind: "photo" },
				] satisfies PendingUpload[],
				removed: [readyPhoto.contentId],
				saving: false,
				maxPhotos: 2,
				onToggleRemoved: () => {},
				onReorder: () => {},
			},
		});

		expect(
			container.querySelector('[data-slot="add-media-tile"]'),
		).toHaveProperty("disabled", true);
		expect(
			render(AlbumContentGrid, {
				props: {
					albumId: 903,
					content: [readyPhoto],
					pending: [],
					removed: [],
					saving: false,
					maxPhotos: null,
					onToggleRemoved: () => {},
					onReorder: () => {},
				},
			}).container.querySelector('[data-slot="add-media-tile"]'),
			"unknown limits leave adding open",
		).toHaveProperty("disabled", false);
	});

	it("stops adding from the empty state when the album is full", () => {
		const { getByRole } = render(AlbumContentGrid, {
			props: {
				albumId: 903,
				content: [],
				pending: [],
				removed: [],
				saving: false,
				maxPhotos: 0,
				onToggleRemoved: () => {},
				onReorder: () => {},
			},
		});

		expect(
			getByRole("button", { name: "Add photos or videos" }),
		).toHaveProperty("disabled", true);
	});

	it("offers the add button in the empty state", () => {
		const { container, getByRole } = render(AlbumContentGrid, {
			props: {
				albumId: 903,
				content: [],
				pending: [],
				removed: [],
				saving: false,
				maxPhotos: null,
				onToggleRemoved: () => {},
				onReorder: () => {},
			},
		});

		expect(
			container.querySelector('[data-slot="media-slot-grid"]'),
		).toBeNull();
		expect(
			getByRole("button", { name: "Add photos or videos" }),
		).toBeTruthy();
	});

	it("names every item and its remove toggle by the slot it sits in", () => {
		const { getByRole } = render(AlbumContentGrid, {
			props: {
				albumId: 903,
				content: [readyPhoto, processingVideo],
				pending: [],
				removed: [processingVideo.contentId],
				saving: false,
				maxPhotos: null,
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
