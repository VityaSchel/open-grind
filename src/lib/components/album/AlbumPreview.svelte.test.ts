// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const lightbox = vi.hoisted(() => ({
	loadAlbumSlides: vi.fn(),
	openAlbumLightbox: vi.fn(),
}));
const sonner = vi.hoisted(() => ({
	toast: { info: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("./album-lightbox", () => lightbox);
vi.mock("svelte-sonner", () => sonner);

import AlbumPreview from "./AlbumPreview.svelte";

const BROKEN = '[data-slot="broken-media"]';

function previewWithCover(coverUrl: string | null): Element {
	const { container } = render(AlbumPreview, {
		props: { albumId: 900, coverUrl, hasPhoto: true, hasVideo: false },
	});
	const preview = container.querySelector('[data-slot="album-preview"]');
	if (preview === null) throw new Error("no album preview");
	return preview;
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("album preview", () => {
	it("shows a plain cover without the broken image icon when there is no cover", () => {
		const preview = previewWithCover(null);

		expect(
			preview.querySelector('[data-slot="empty-media"]'),
		).not.toBeNull();
		expect(preview.querySelector(BROKEN)).toBeNull();
	});

	it("shows the broken image icon when the cover fails to load", async () => {
		const preview = previewWithCover("https://example.invalid/cover");
		const cover = preview.querySelector("img");
		if (cover === null) throw new Error("no cover image");

		await fireEvent.error(cover);

		expect(preview.querySelector(BROKEN)).not.toBeNull();
	});

	it("goes back to idle without a word when the album has nothing ready to show", async () => {
		let answer!: (slides: never[]) => void;
		lightbox.loadAlbumSlides.mockReturnValue(
			new Promise((resolve) => (answer = resolve)),
		);
		const { getByRole } = render(AlbumPreview, {
			props: {
				albumId: 900,
				coverUrl: null,
				hasPhoto: false,
				hasVideo: true,
			},
		});
		const button = getByRole("button", {
			name: "Open album",
		}) as HTMLButtonElement;

		await fireEvent.click(button);
		expect(button.disabled).toBe(true);
		answer([]);
		await vi.waitFor(() => expect(button.disabled).toBe(false));

		expect(lightbox.loadAlbumSlides).toHaveBeenCalledWith(900);
		expect(lightbox.openAlbumLightbox).not.toHaveBeenCalled();
		expect(sonner.toast.info).not.toHaveBeenCalled();
		expect(sonner.toast.error).not.toHaveBeenCalled();
		expect(sonner.toast.message).not.toHaveBeenCalled();
	});
});
