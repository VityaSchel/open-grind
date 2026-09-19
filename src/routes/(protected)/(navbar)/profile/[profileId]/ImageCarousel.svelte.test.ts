// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { isPhotoSwipeBusy } from "$lib/util/photoswipe";
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
