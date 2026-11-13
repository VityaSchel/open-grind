import type PhotoSwipeLightbox from "photoswipe/lightbox";

import {
	applyPhotoSwipeBackGesture,
	applyPhotoSwipeErrorUi,
	applyPhotoSwipeThumbDimensions,
	applyPhotoSwipeViewportSync,
	CLOSE_SVG,
	ZOOM_ANIMATION_MS,
	ZOOM_SVG,
} from ".";
import { fullImageSizeInTime, knownFullImageSize } from "./full-size";
import { applyPhotoSwipeRoundedCrops } from "./rounded-crop";
import { applyPhotoSwipeLoadedSize } from "./sizing";
import { applyPhotoSwipeThumbRadii } from "./thumb-radius";

function setThumbsVisibility({
	gallery,
	visibility,
}: {
	gallery: HTMLElement;
	visibility: "hidden" | "";
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

function sizeFromFullImages(lightbox: PhotoSwipeLightbox) {
	lightbox.options.preloadFirstSlide = false;
	lightbox.options.openPromise = () => {
		const { src } = lightbox.getItemData(lightbox.options.index ?? 0);
		return src ? fullImageSizeInTime(src) : Promise.resolve(null);
	};
	lightbox.addFilter("itemData", (itemData) => {
		const size = itemData.src ? knownFullImageSize(itemData.src) : null;
		return size === null
			? itemData
			: { ...itemData, ...size, msrc: itemData.src, thumbCropped: true };
	});
	applyPhotoSwipeLoadedSize(lightbox);
}

function configure({
	lightbox,
	gallery,
	thumbScale,
	croppedThumbs,
}: {
	lightbox: PhotoSwipeLightbox;
	gallery: HTMLElement;
	thumbScale: number;
	croppedThumbs: boolean;
}) {
	applyPhotoSwipeErrorUi(lightbox);
	if (croppedThumbs) {
		sizeFromFullImages(lightbox);
		applyPhotoSwipeRoundedCrops(lightbox);
	} else {
		applyPhotoSwipeThumbDimensions(lightbox);
		if (thumbScale !== 1) scaleThumbSize({ lightbox, thumbScale });
		applyPhotoSwipeThumbRadii(lightbox);
	}
	applyPhotoSwipeViewportSync(lightbox);
	applyPhotoSwipeBackGesture(lightbox);
	const hideThumbs = () =>
		setThumbsVisibility({ gallery, visibility: "hidden" });
	lightbox.on("openingAnimationStart", hideThumbs);
	lightbox.on("closingAnimationStart", hideThumbs);
	lightbox.on("destroy", () =>
		setThumbsVisibility({ gallery, visibility: "" }),
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
				showAnimationDuration: ZOOM_ANIMATION_MS,
				hideAnimationDuration: ZOOM_ANIMATION_MS,
				closeSVG: CLOSE_SVG,
				zoomSVG: ZOOM_SVG,
			});
			configure({ lightbox, gallery, thumbScale, croppedThumbs });
			lightbox.init();
		})
		.catch((error) => console.error(error));
	return () => {
		disposed = true;
		lightbox?.destroy();
	};
}
