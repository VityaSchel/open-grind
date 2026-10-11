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

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import AlbumPreview from "./AlbumPreview.svelte";

const BROKEN = '[data-slot="broken-media"]';
const PREVIEW = '[data-slot="album-preview"]';

function previewWithCover(coverUrl: string | null): Element {
	const { container } = render(AlbumPreview, {
		props: { albumId: 900, coverUrl, hasPhoto: true, hasVideo: false },
	});
	const preview = container.querySelector(PREVIEW);
	if (preview === null) throw new Error("no album preview");
	return preview;
}

function renderPreview(label?: string): HTMLButtonElement {
	const { container } = render(AlbumPreview, {
		props: {
			albumId: 900,
			coverUrl: null,
			hasPhoto: true,
			hasVideo: false,
			label,
		},
	});
	const preview = container.querySelector<HTMLButtonElement>(PREVIEW);
	if (preview === null) throw new Error("no album preview");
	return preview;
}

async function failedToastLabel(preview: HTMLButtonElement): Promise<unknown> {
	const consoleError = vi
		.spyOn(console, "error")
		.mockImplementation(() => {});
	await fireEvent.click(preview);
	await vi.waitFor(() => expect(sonner.toast.error).toHaveBeenCalledOnce());
	await vi.waitFor(() => expect(preview.disabled).toBe(false));
	expect(consoleError).toHaveBeenCalledOnce();
	return sonner.toast.error.mock.calls[0]?.[0];
}

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
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

	it("says when the album fails to load", async () => {
		lightbox.loadAlbumSlides.mockRejectedValue(new Error("offline"));

		expect(await failedToastLabel(renderPreview())).toBe(
			"Couldn’t load album",
		);
		expect(lightbox.openAlbumLightbox).not.toHaveBeenCalled();
	});

	it("says when the loaded album fails to open", async () => {
		lightbox.loadAlbumSlides.mockResolvedValue([{ contentId: 1 }]);
		lightbox.openAlbumLightbox.mockRejectedValue(new Error("no viewer"));

		expect(await failedToastLabel(renderPreview())).toBe(
			"Couldn’t open album",
		);
	});

	it("words its failure toasts in the locale active when they show", async () => {
		lightbox.loadAlbumSlides.mockRejectedValue(new Error("offline"));
		const preview = renderPreview();

		await setLocale({ locale: "en-XA" });

		expect(await failedToastLabel(preview)).toMatch(PSEUDO_MESSAGE);
	});

	it("names itself in the active locale unless the caller names it", async () => {
		const named = renderPreview();
		const custom = renderPreview("Studio");
		expect(named.getAttribute("aria-label")).toBe("Open album");

		await setLocale({ locale: "en-XA" });

		expect(named.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
		expect(custom.getAttribute("aria-label")).toBe("Studio");
	});
});

describe("album preview cover renewal", () => {
	const OLD =
		"https://d3.cloudfront.net/albums/c.jpg?Expires=1700000900&Signature=OLD&Key-Pair-Id=K";
	const RENEWED =
		"https://d3.cloudfront.net/albums/c.jpg?Expires=1700004500&Signature=NEW&Key-Pair-Id=K";

	function renderCover(coverUrl: string) {
		const { container, rerender } = render(AlbumPreview, {
			props: { albumId: 900, coverUrl, hasPhoto: true, hasVideo: false },
		});
		const image = () => {
			const img = container.querySelector("img");
			if (img === null) throw new Error("no cover image");
			return img;
		};
		return { image, renew: (next: string) => rerender({ coverUrl: next }) };
	}

	it("keeps a loaded cover on its url when only the signature is renewed", async () => {
		const cover = renderCover(OLD);
		Object.defineProperty(cover.image(), "naturalWidth", {
			get: () => 300,
		});
		await fireEvent.load(cover.image());

		await cover.renew(RENEWED);

		expect(cover.image().getAttribute("src")).toBe(OLD);
	});

	it("loads the renewed url for a cover that failed", async () => {
		const cover = renderCover(OLD);
		await fireEvent.error(cover.image());

		await cover.renew(RENEWED);

		expect(cover.image().getAttribute("src")).toBe(RENEWED);
	});
});
