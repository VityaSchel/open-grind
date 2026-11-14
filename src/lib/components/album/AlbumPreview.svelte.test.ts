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

import { singleClick } from "../../../routes/(protected)/chat/[conversationId]/messages/message/single-click";
import AlbumPreview from "./AlbumPreview.svelte";

const BROKEN = '[data-slot="broken-media"]';

function previewWithCover(
	coverUrl: string | null,
	{ chat = false } = {},
): Element {
	const { container } = render(AlbumPreview, {
		props: {
			albumId: 900,
			coverUrl,
			hasPhoto: true,
			hasVideo: false,
			attach: chat ? singleClick : undefined,
		},
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

it("cancels a pending album open on a second press and double click", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	try {
		const button = previewWithCover(null, { chat: true });
		await fireEvent.click(button, { detail: 1 });
		await vi.advanceTimersByTimeAsync(100);
		await fireEvent.pointerDown(button);
		await vi.advanceTimersByTimeAsync(300);
		expect(lightbox.loadAlbumSlides).not.toHaveBeenCalled();
		await fireEvent.click(button, { detail: 1 });
		await fireEvent.click(button, { detail: 1 });
		await fireEvent.doubleClick(button);
		await vi.advanceTimersByTimeAsync(300);
		expect(lightbox.loadAlbumSlides).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});

it("cancels a pending album open when removed", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	try {
		const button = previewWithCover(null, { chat: true });
		await fireEvent.click(button, { detail: 1 });
		cleanup();
		await vi.advanceTimersByTimeAsync(300);
		expect(lightbox.loadAlbumSlides).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});

it("opens the album editor preview immediately on a pointer click", async () => {
	lightbox.loadAlbumSlides.mockResolvedValue([]);
	const button = previewWithCover(null);
	await fireEvent.click(button, { detail: 1 });
	expect(lightbox.loadAlbumSlides).toHaveBeenCalledExactlyOnceWith(900);
});
