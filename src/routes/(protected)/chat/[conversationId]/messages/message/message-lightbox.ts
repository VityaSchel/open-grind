import "photoswipe/style.css";

import "./message-lightbox.css";

import type PhotoSwipeLightbox from "photoswipe/lightbox";

import {
	applyPhotoSwipeBackGesture,
	applyPhotoSwipeErrorUi,
	applyPhotoSwipeThumbDimensions,
	applyPhotoSwipeViewportSync,
} from "$lib/util/photoswipe";

const PHOTOSWIPE_PLACEHOLDER_WIDTH_PX = 250;

function setThumbRadii(lightbox: PhotoSwipeLightbox) {
	const slide = lightbox.pswp?.currSlide;
	const thumb = slide?.data.element?.querySelector("img");
	if (!slide || !(thumb instanceof HTMLImageElement)) return;

	const thumbWidth = thumb.getBoundingClientRect().width;
	const displayedWidth = slide.width * slide.zoomLevels.initial;
	if (thumbWidth === 0 || displayedWidth === 0) return;

	const style = getComputedStyle(thumb);
	const corners = [
		style.borderTopLeftRadius,
		style.borderTopRightRadius,
		style.borderBottomRightRadius,
		style.borderBottomLeftRadius,
	].map(parseFloat);

	const radiiUndoingScale = (scale: number) =>
		corners.map((corner) => `${corner / scale}px`).join(" ");

	const root = document.documentElement.style;
	root.setProperty(
		"--pswp-thumb-radius",
		radiiUndoingScale(thumbWidth / displayedWidth),
	);
	root.setProperty(
		"--pswp-placeholder-radius",
		radiiUndoingScale(thumbWidth / PHOTOSWIPE_PLACEHOLDER_WIDTH_PX),
	);
}

function clearThumbRadii() {
	document.documentElement.style.removeProperty("--pswp-thumb-radius");
	document.documentElement.style.removeProperty("--pswp-placeholder-radius");
}

function setThumbsVisibility({
	gallery,
	visibility,
}: {
	gallery: HTMLElement;
	visibility: "hidden" | "visible";
}) {
	gallery.querySelectorAll(".item").forEach((item) => {
		if (item instanceof HTMLElement) item.style.visibility = visibility;
	});
}

function scaleThumbSize({
	lightbox,
	thumbScale,
}: {
	lightbox: PhotoSwipeLightbox;
	thumbScale: number;
}) {
	lightbox.addFilter("itemData", (itemData) => ({
		...itemData,
		width: (itemData.width ?? 0) * thumbScale,
		height: (itemData.height ?? 0) * thumbScale,
	}));
}

function configure({
	lightbox,
	gallery,
	thumbScale,
}: {
	lightbox: PhotoSwipeLightbox;
	gallery: HTMLElement;
	thumbScale: number;
}) {
	applyPhotoSwipeErrorUi(lightbox);
	applyPhotoSwipeThumbDimensions(lightbox);
	if (thumbScale !== 1) scaleThumbSize({ lightbox, thumbScale });
	applyPhotoSwipeViewportSync(lightbox);
	applyPhotoSwipeBackGesture(lightbox);

	lightbox.on("openingAnimationStart", () => {
		setThumbRadii(lightbox);
		lightbox.pswp?.element?.classList.add("pswp--radius-opening");
		setThumbsVisibility({ gallery, visibility: "hidden" });
	});
	lightbox.on("openingAnimationEnd", () => {
		lightbox.pswp?.element?.classList.remove("pswp--radius-opening");
		clearThumbRadii();
	});
	lightbox.on("closingAnimationStart", () => {
		setThumbRadii(lightbox);
		lightbox.pswp?.element?.classList.add("pswp--radius-closing");
		setThumbsVisibility({ gallery, visibility: "hidden" });
	});
	lightbox.on("closingAnimationEnd", clearThumbRadii);
	lightbox.on("destroy", () =>
		setThumbsVisibility({ gallery, visibility: "visible" }),
	);
}

export function attachGalleryLightbox({
	gallery,
	thumbScale = 1,
}: {
	gallery: HTMLElement;
	thumbScale?: number;
}): () => void {
	let disposed = false;
	let lightbox: PhotoSwipeLightbox | undefined;
	import("photoswipe/lightbox")
		.then(({ default: PhotoSwipeLightbox }) => {
			if (disposed) return;
			lightbox = new PhotoSwipeLightbox({
				gallery,
				children: "a[href]",
				pswpModule: () => import("photoswipe"),
				mainClass: "pswp--buttons-visible",
				showAnimationDuration: 500,
				hideAnimationDuration: 500,
			});
			configure({ lightbox, gallery, thumbScale });
			lightbox.init();
		})
		.catch((error) => console.error(error));
	return () => {
		disposed = true;
		lightbox?.destroy();
	};
}
