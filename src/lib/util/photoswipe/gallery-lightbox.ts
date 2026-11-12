import "./gallery-lightbox.css";

import type PhotoSwipeLightbox from "photoswipe/lightbox";

import {
	applyPhotoSwipeBackGesture,
	applyPhotoSwipeErrorUi,
	applyPhotoSwipeThumbDimensions,
	applyPhotoSwipeViewportSync,
	CLOSE_SVG,
	ZOOM_SVG,
} from ".";
import { fullImageSizeWithin, knownFullImageSize } from "./full-size";

const PHOTOSWIPE_PLACEHOLDER_WIDTH_PX = 250;
const FULL_SIZE_WAIT_MS = 1500;

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

function sizeFromFullImages({
	lightbox,
	gallery,
	signal,
}: {
	lightbox: PhotoSwipeLightbox;
	gallery: HTMLElement;
	signal: AbortSignal;
}) {
	let opened: string | null = null;
	gallery.addEventListener(
		"click",
		(event) => {
			const link =
				event.target instanceof Element
					? event.target.closest<HTMLAnchorElement>("a[href]")
					: null;
			opened = link?.href ?? null;
		},
		{ capture: true, signal },
	);
	lightbox.options.preloadFirstSlide = false;
	lightbox.options.openPromise = () =>
		opened === null
			? Promise.resolve(null)
			: fullImageSizeWithin({
					src: opened,
					timeoutMs: FULL_SIZE_WAIT_MS,
				});
	lightbox.addFilter("itemData", (itemData) => {
		const size = itemData.src ? knownFullImageSize(itemData.src) : null;
		if (size === null) return { ...itemData, width: 0, height: 0 };
		return { ...itemData, ...size, msrc: itemData.src, thumbCropped: true };
	});
}

function configure({
	lightbox,
	gallery,
	thumbScale,
	croppedThumbs,
	signal,
}: {
	lightbox: PhotoSwipeLightbox;
	gallery: HTMLElement;
	thumbScale: number;
	croppedThumbs: boolean;
	signal: AbortSignal;
}) {
	applyPhotoSwipeErrorUi(lightbox);
	applyPhotoSwipeThumbDimensions(lightbox);
	if (thumbScale !== 1) scaleThumbSize({ lightbox, thumbScale });
	if (croppedThumbs) sizeFromFullImages({ lightbox, gallery, signal });
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
	croppedThumbs = false,
}: {
	gallery: HTMLElement;
	thumbScale?: number;
	croppedThumbs?: boolean;
}): () => void {
	const disposal = new AbortController();
	let lightbox: PhotoSwipeLightbox | undefined;
	import("photoswipe/lightbox")
		.then(({ default: PhotoSwipeLightbox }) => {
			if (disposal.signal.aborted) return;
			lightbox = new PhotoSwipeLightbox({
				gallery,
				children: "a[href]",
				pswpModule: () => import("photoswipe"),
				mainClass: "pswp--buttons-visible",
				showAnimationDuration: 500,
				hideAnimationDuration: 500,
				closeSVG: CLOSE_SVG,
				zoomSVG: ZOOM_SVG,
			});
			configure({
				lightbox,
				gallery,
				thumbScale,
				croppedThumbs,
				signal: disposal.signal,
			});
			lightbox.init();
		})
		.catch((error) => console.error(error));
	return () => {
		disposal.abort();
		lightbox?.destroy();
	};
}
