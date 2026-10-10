// @vitest-environment jsdom

import PhotoSwipeLightbox from "photoswipe/lightbox";
import { describe, expect, it, vi } from "vitest";

import { TRANSPARENT_PIXEL } from "$lib/util/load-when-visible";
import {
	applyPhotoSwipeLoadedSize,
	applyPhotoSwipeThumbDimensions,
} from "./sizing";

describe("applyPhotoSwipeThumbDimensions", () => {
	function thumbnailItem({ src, size }: { src: string; size: number }) {
		const element = document.createElement("a");
		const thumbnail = document.createElement("img");
		thumbnail.src = src;
		Object.defineProperty(thumbnail, "naturalWidth", { get: () => size });
		Object.defineProperty(thumbnail, "naturalHeight", { get: () => size });
		element.append(thumbnail);
		return { element, width: 600, height: 800 };
	}

	function sized(item: ReturnType<typeof thumbnailItem>) {
		const lightbox = new PhotoSwipeLightbox({});
		applyPhotoSwipeThumbDimensions(lightbox);
		return lightbox.applyFilters("itemData", item, 0);
	}

	it("sizes the slide from a loaded thumbnail", () => {
		expect(
			sized(thumbnailItem({ src: "https://cdn.test/a.jpg", size: 320 })),
		).toMatchObject({ width: 320, height: 320 });
	});

	it("keeps the known size while the thumbnail still shows the placeholder pixel", () => {
		expect(
			sized(thumbnailItem({ src: TRANSPARENT_PIXEL, size: 1 })),
		).toMatchObject({ width: 600, height: 800 });
	});
});

describe("applyPhotoSwipeLoadedSize", () => {
	function slideAndContent({
		width,
		element,
	}: {
		width: number;
		element: HTMLElement;
	}) {
		const slide = {
			width,
			height: width,
			currentResolution: 1,
			calculateSize: vi.fn(),
			zoomAndPanToInitial: vi.fn(),
			applyCurrentZoomPan: vi.fn(),
			updateContentSize: vi.fn(),
		};
		return { slide, content: { width, height: width, element } };
	}

	function photo({ width, height }: { width: number; height: number }) {
		const image = document.createElement("img");
		Object.defineProperty(image, "naturalWidth", { get: () => width });
		Object.defineProperty(image, "naturalHeight", { get: () => height });
		return image;
	}

	function loaded(event: ReturnType<typeof slideAndContent>) {
		const lightbox = new PhotoSwipeLightbox({});
		applyPhotoSwipeLoadedSize(lightbox);
		lightbox.dispatch("loadComplete", event as never);
		return event;
	}

	it("sizes an unsized photo slide once its photo has loaded", () => {
		const { slide, content } = loaded(
			slideAndContent({
				width: 0,
				element: photo({ width: 1200, height: 900 }),
			}),
		);

		expect([content.width, content.height]).toEqual([1200, 900]);
		expect([slide.width, slide.height]).toEqual([1200, 900]);
		expect(slide.updateContentSize).toHaveBeenCalledWith(true);
	});

	it("leaves a slide alone that already had a size or is not a photo", () => {
		const sized = loaded(
			slideAndContent({
				width: 300,
				element: photo({ width: 1200, height: 900 }),
			}),
		);
		const component = loaded(
			slideAndContent({
				width: 0,
				element: document.createElement("div"),
			}),
		);

		expect(sized.content.width).toBe(300);
		expect(component.content.width).toBe(0);
		expect(sized.slide.updateContentSize).not.toHaveBeenCalled();
		expect(component.slide.updateContentSize).not.toHaveBeenCalled();
	});

	it("shows no placeholder for a slide whose size is not known yet", () => {
		const lightbox = new PhotoSwipeLightbox({});
		applyPhotoSwipeLoadedSize(lightbox);
		const placeholder = (width: number) =>
			lightbox.applyFilters("useContentPlaceholder", true, {
				width,
			} as never);

		expect(placeholder(0)).toBe(false);
		expect(placeholder(300)).toBe(true);
	});
});
