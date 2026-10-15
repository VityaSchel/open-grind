import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { TRANSPARENT_PIXEL } from "$lib/util/load-when-visible";

const LAYOUT_UNIT_PX = 1 / 64;

function wholePixelsCovering(length: number): number {
	return Math.ceil(length - LAYOUT_UNIT_PX);
}

export function applyPhotoSwipeViewportSync(
	lightbox: PhotoSwipeLightbox,
): void {
	lightbox.options.getViewportSizeFn = () => {
		const root = lightbox.pswp?.element;
		if (root === undefined)
			return {
				x: document.documentElement.clientWidth,
				y: window.innerHeight,
			};
		const { width, height } = root.getBoundingClientRect();
		return {
			x: wholePixelsCovering(width),
			y: wholePixelsCovering(height),
		};
	};
	lightbox.on("openingAnimationEnd", () => {
		lightbox.pswp?.updateSize(true);
	});
}

export function applyPhotoSwipeThumbDimensions(
	lightbox: PhotoSwipeLightbox,
): void {
	lightbox.addFilter("itemData", (itemData) => {
		const img = itemData.element?.querySelector("img");
		if (img?.naturalWidth && img.src !== TRANSPARENT_PIXEL) {
			itemData.width = img.naturalWidth;
			itemData.height = img.naturalHeight;
		}
		return itemData;
	});
	applyPhotoSwipeLoadedSize(lightbox);
}

export function applyPhotoSwipeLoadedSize(lightbox: PhotoSwipeLightbox): void {
	lightbox.addFilter(
		"useContentPlaceholder",
		(usePlaceholder, content) => usePlaceholder && content.width > 0,
	);
	lightbox.on("loadComplete", ({ slide, content }) => {
		const image = content.element;
		if (
			content.width > 0 ||
			!(image instanceof HTMLImageElement) ||
			image.naturalWidth === 0
		)
			return;
		content.width = slide.width = image.naturalWidth;
		content.height = slide.height = image.naturalHeight;
		slide.currentResolution = 0;
		slide.calculateSize();
		slide.zoomAndPanToInitial();
		slide.applyCurrentZoomPan();
		slide.updateContentSize(true);
	});
}
