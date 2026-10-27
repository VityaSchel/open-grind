// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isPhotoSwipeBusy } from "$lib/util/photoswipe";
import * as safeArea from "$lib/util/safe-area";
import ImageCarousel from "./ImageCarousel.svelte";

const PHOTO_HEIGHT = 540;
const FRACTIONAL_PHOTO_HEIGHT = 1648 / 3;
const SEVEN_PHOTOS = mediasOf(["a", "b", "c", "d", "e", "f", "g"]);

function mediasOf(hashes: string[]) {
	return hashes.map((mediaHash) => ({
		mediaHash,
		takenOnGrindr: null,
		createdAt: null,
	}));
}

const MEDIAS = mediasOf(["first", "second"]);

function galleryOf({
	container,
	photoHeight,
}: {
	container: HTMLElement;
	photoHeight: number;
}) {
	const gallery = container.querySelector<HTMLElement>(".carousel")!;
	gallery.getBoundingClientRect = () => new DOMRect(0, 0, 0, photoHeight);
	Object.defineProperty(gallery, "clientHeight", {
		get: () => Math.floor(photoHeight),
	});
	return (scrollTop: number) => {
		gallery.scrollTop = scrollTop;
		return fireEvent.scroll(gallery);
	};
}

describe("ImageCarousel", () => {
	afterEach(cleanup);
	afterEach(() => vi.restoreAllMocks());

	it("waits for the viewer to open before sending a normalized reply", async () => {
		const onreply = vi.fn();
		const opened = vi.spyOn(PhotoSwipeLightbox.prototype, "loadAndOpen");
		const { getByRole } = render(ImageCarousel, {
			props: { medias: MEDIAS, onreply },
		});
		await import("photoswipe/lightbox");
		await new Promise((resolve) => setTimeout(resolve));
		await fireEvent.click(
			getByRole("link", { name: "Profile photo 1 of 2" }),
		);
		const textbox = await screen.findByRole("textbox", {
			name: "Reply to profile photo",
		});
		await fireEvent.input(textbox, {
			target: { value: "  Nice photo!  " },
		});
		const button = screen.getByRole<HTMLButtonElement>("button", {
			name: "Send reply",
		});
		const lightbox = opened.mock.contexts.at(-1) as PhotoSwipeLightbox;
		expect(lightbox.pswp?.opener.isOpening).toBe(true);
		expect(button.disabled).toBe(true);
		await vi.waitFor(() => expect(button.disabled).toBe(false));
		await fireEvent.click(button);
		await vi.waitFor(
			() =>
				expect(onreply).toHaveBeenCalledExactlyOnceWith({
					imageHash: "first",
					text: "Nice photo!",
				}),
			{ timeout: 3000 },
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("reserves the composer before calculating the opening animation", async () => {
		vi.spyOn(safeArea, "safeAreaInsets").mockReturnValue({
			top: 0,
			right: 0,
			bottom: 20,
			left: 0,
		});
		vi.spyOn(
			HTMLElement.prototype,
			"getBoundingClientRect",
		).mockImplementation(function (this: HTMLElement) {
			return this.classList.contains("pswp__reply-composer")
				? new DOMRect(0, 728, 400, 52)
				: new DOMRect();
		});
		const initialized = vi.spyOn(PhotoSwipeLightbox.prototype, "init");
		const { getByRole } = render(ImageCarousel, {
			props: { medias: MEDIAS, onreply: vi.fn() },
		});
		await vi.waitFor(() => expect(initialized).toHaveBeenCalledOnce());
		const lightbox = initialized.mock.contexts[0] as PhotoSwipeLightbox;
		let initialBottom: number | undefined;
		lightbox.on("initialLayout", () => {
			initialBottom = lightbox.options.paddingFn!(
				{ x: 400, y: 800 },
				{},
				0,
			).bottom;
		});
		await fireEvent.click(
			getByRole("link", { name: "Profile photo 1 of 2" }),
		);
		await vi.waitFor(() => expect(initialBottom).toBe(72));
		await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));
	});

	it("updates the reply layout when the profile loads before opening", async () => {
		const initialized = vi.spyOn(PhotoSwipeLightbox.prototype, "init");
		const { getByRole, rerender } = render(ImageCarousel, {
			props: { medias: MEDIAS },
		});
		await vi.waitFor(() => expect(initialized).toHaveBeenCalledOnce());
		await rerender({ medias: MEDIAS, onreply: vi.fn() });
		await fireEvent.click(
			getByRole("link", { name: "Profile photo 1 of 2" }),
		);
		const dialog = await screen.findByRole("dialog");
		expect(dialog.classList.contains("pswp--profile-reply")).toBe(true);
		expect(
			screen.getByRole("textbox", { name: "Reply to profile photo" }),
		).toBeTruthy();
		const lightbox = initialized.mock.contexts[0] as PhotoSwipeLightbox;
		await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));
	});

	it("keeps an open viewer when the loaded profile enables replies", async () => {
		const insets = { top: 24, right: 14, bottom: 20, left: 12 };
		vi.spyOn(safeArea, "safeAreaInsets").mockReturnValue(insets);
		const onreply = vi.fn();
		const opened = vi.spyOn(PhotoSwipeLightbox.prototype, "loadAndOpen");
		const { getByRole, rerender } = render(ImageCarousel, {
			props: { medias: MEDIAS },
		});
		await import("photoswipe/lightbox");
		await new Promise((resolve) => setTimeout(resolve));
		await fireEvent.click(
			getByRole("link", { name: "Profile photo 1 of 2" }),
		);
		const lightbox = opened.mock.contexts.at(-1) as PhotoSwipeLightbox;
		await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));
		const dialog = screen.getByRole("dialog");
		expect(
			screen.queryByRole("textbox", { name: "Reply to profile photo" }),
		).toBeNull();

		expect(lightbox.options.paddingFn!({ x: 400, y: 800 }, {}, 0)).toEqual({
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
		});
		const changed = vi.fn();
		lightbox.pswp!.on("change", changed);
		expect(lightbox.pswp!.options.imageClickAction).toBe("zoom-or-close");
		await rerender({ medias: MEDIAS, onreply });
		expect(lightbox.options.paddingFn!({ x: 400, y: 800 }, {}, 0)).toEqual({
			top: 0,
			right: 0,
			bottom: insets.bottom,
			left: 0,
		});
		expect(lightbox.pswp!.options.imageClickAction).toBe("zoom");
		expect(changed).not.toHaveBeenCalled();

		expect(screen.getByRole("dialog")).toBe(dialog);
		expect(lightbox.pswp?.opener.isOpen).toBe(true);
		await fireEvent.input(
			screen.getByRole("textbox", { name: "Reply to profile photo" }),
			{ target: { value: "Nice photo!" } },
		);
		const latestReply = vi.fn();
		await rerender({ medias: MEDIAS, onreply: undefined });
		expect(lightbox.pswp!.options.imageClickAction).toBe("zoom-or-close");
		await rerender({ medias: MEDIAS, onreply: latestReply });
		expect(changed).not.toHaveBeenCalled();
		await fireEvent.click(
			screen.getByRole("button", { name: "Send reply" }),
		);
		await vi.waitFor(() =>
			expect(latestReply).toHaveBeenCalledExactlyOnceWith({
				imageHash: "first",
				text: "Nice photo!",
			}),
		);
		expect(onreply).not.toHaveBeenCalled();
	});

	it("replies to the current photo after navigating in the viewer", async () => {
		const onreply = vi.fn();
		const opened = vi.spyOn(PhotoSwipeLightbox.prototype, "loadAndOpen");
		const { getByRole } = render(ImageCarousel, {
			props: { medias: MEDIAS, onreply },
		});
		await import("photoswipe/lightbox");
		await new Promise((resolve) => setTimeout(resolve));
		await fireEvent.click(
			getByRole("link", { name: "Profile photo 1 of 2" }),
		);
		const lightbox = opened.mock.contexts.at(-1) as PhotoSwipeLightbox;
		await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));
		lightbox.pswp?.next();
		await fireEvent.input(
			screen.getByRole("textbox", { name: "Reply to profile photo" }),
			{ target: { value: "Nice photo!" } },
		);
		await fireEvent.click(
			screen.getByRole("button", { name: "Send reply" }),
		);
		await vi.waitFor(() =>
			expect(onreply).toHaveBeenCalledExactlyOnceWith({
				imageHash: "second",
				text: "Nice photo!",
			}),
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("replies with the displayed hash after an earlier photo failed", async () => {
		const onreply = vi.fn();
		const opened = vi.spyOn(PhotoSwipeLightbox.prototype, "loadAndOpen");
		const { getByRole, unmount } = render(ImageCarousel, {
			props: { medias: MEDIAS, onreply },
		});
		await import("photoswipe/lightbox");
		await new Promise((resolve) => setTimeout(resolve));
		const first = getByRole("link", { name: "Profile photo 1 of 2" });
		await fireEvent.error(within(first).getByRole("presentation"));
		await vi.waitFor(() => expect(first.hasAttribute("href")).toBe(false));
		await fireEvent.click(
			getByRole("link", { name: "Profile photo 2 of 2" }),
		);
		const lightbox = opened.mock.contexts.at(-1) as PhotoSwipeLightbox;
		await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));
		await fireEvent.input(
			screen.getByRole("textbox", { name: "Reply to profile photo" }),
			{ target: { value: "Nice photo!" } },
		);
		await fireEvent.click(
			screen.getByRole("button", { name: "Send reply" }),
		);
		await vi.waitFor(() =>
			expect(onreply).toHaveBeenCalledExactlyOnceWith({
				imageHash: "second",
				text: "Nice photo!",
			}),
		);
		expect(screen.queryByRole("dialog")).toBeNull();
		unmount();
	});

	it("keeps the first photo element when the one-photo list grows into the full list", async () => {
		const { container, rerender } = render(ImageCarousel, {
			props: { medias: MEDIAS.slice(0, 1) },
		});
		const first = container.querySelector("img");

		await rerender({ medias: MEDIAS });

		const images = container.querySelectorAll("img");
		expect(images).toHaveLength(2);
		expect(images.item(0)).toBe(first);
	});

	it("loads photos only two past the furthest one scrolled to, and never unloads them", async () => {
		const { container } = render(ImageCarousel, {
			props: { medias: SEVEN_PHOTOS },
		});
		const scrollTo = galleryOf({ container, photoHeight: PHOTO_HEIGHT });
		const scrollToPhoto = (position: number) =>
			scrollTo(position * PHOTO_HEIGHT);

		expect(container.querySelectorAll(".item img")).toHaveLength(3);
		expect(container.querySelectorAll(".item[href]")).toHaveLength(7);

		await scrollToPhoto(1);
		expect(container.querySelectorAll(".item img")).toHaveLength(4);

		await scrollToPhoto(2.25);
		expect(container.querySelectorAll(".item img")).toHaveLength(6);

		await scrollToPhoto(0);
		expect(container.querySelectorAll(".item img")).toHaveLength(6);
		expect(container.querySelectorAll(".item[href]")).toHaveLength(7);
	});

	it("counts a photo resting a sub-pixel past its fractional stop as the furthest one reached", async () => {
		const { container } = render(ImageCarousel, {
			props: { medias: SEVEN_PHOTOS },
		});
		const scrollTo = galleryOf({
			container,
			photoHeight: FRACTIONAL_PHOTO_HEIGHT,
		});

		await scrollTo(3 * FRACTIONAL_PHOTO_HEIGHT + 0.25);

		expect(container.querySelectorAll(".item img")).toHaveLength(6);
	});

	it("tracks a photo click as an opening lightbox until it unmounts", async () => {
		const { container, unmount } = render(ImageCarousel, {
			props: { medias: MEDIAS },
		});
		await import("photoswipe/lightbox");
		await new Promise((resolve) => setTimeout(resolve));

		container.querySelector("img")!.click();
		expect(isPhotoSwipeBusy()).toBe(true);

		unmount();
		expect(isPhotoSwipeBusy()).toBe(false);
	});

	it("releases the photo click when the gallery remounted before the lightbox loaded", async () => {
		const { container, rerender, unmount } = render(ImageCarousel, {
			props: { medias: MEDIAS },
		});
		await Promise.all([
			rerender({ medias: [] }),
			rerender({ medias: MEDIAS }),
		]);
		await import("photoswipe/lightbox");
		await new Promise((resolve) => setTimeout(resolve));

		container.querySelector("img")!.click();
		expect(isPhotoSwipeBusy()).toBe(true);

		unmount();
		expect(isPhotoSwipeBusy()).toBe(false);
	});
});
