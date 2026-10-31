import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import type { MediaDimensions } from "$lib/util/media-dimensions";
import { applyPhotoSwipeErrorUi } from "./error-ui";
import {
	applyPhotoSwipeLoadedSize,
	applyPhotoSwipeViewportSync,
} from "./sizing";
import { applyPhotoSwipeVideo, type VideoSlide } from "./video";
import "photoswipe/style.css";

import "./photoswipe.css";

export { applyPhotoSwipeComponent } from "./component";
export { applyPhotoSwipeErrorUi } from "./error-ui";
export {
	applyPhotoSwipeOpenTracking,
	isPhotoSwipeBusy,
	onPhotoSwipeIdle,
	onPhotoSwipeOpening,
} from "./open-tracking";
export {
	applyPhotoSwipeThumbDimensions,
	applyPhotoSwipeViewportSync,
} from "./sizing";

export function applyPhotoSwipeBackGesture(lightbox: PhotoSwipeLightbox): void {
	const onBackGesture = () => {
		lightbox.pswp?.close();
		return false;
	};
	lightbox.on("beforeOpen", () => {
		backGestureEventHandlers.set(onBackGesture, "overlay");
	});
	lightbox.on("close", () => {
		backGestureEventHandlers.delete(onBackGesture);
	});
}

export const CLOSE_SVG = `<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 256 256" width="32" height="32"><path d="M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z"/></svg>`;

export type LightboxItem = { src: string } & Partial<MediaDimensions>;

export async function openLightbox({
	items,
	index = 0,
	videoAt,
	configure,
	signal,
	onClosed,
}: {
	items: LightboxItem[];
	index?: number;
	videoAt?: (index: number) => VideoSlide | null;
	configure?: (lightbox: PhotoSwipeLightbox) => void;
	signal: AbortSignal;
	onClosed: () => void;
}): Promise<void> {
	const { default: Lightbox } = await import("photoswipe/lightbox");
	if (signal.aborted) return;
	const lightbox = new Lightbox({
		showHideAnimationType: "fade",
		pswpModule: () => import("photoswipe"),
		mainClass: "pswp--buttons-visible",
		closeSVG: CLOSE_SVG,
	});
	applyPhotoSwipeErrorUi(lightbox);
	applyPhotoSwipeViewportSync(lightbox);
	lightbox.addFilter("numItems", () => items.length);
	lightbox.addFilter("itemData", (itemData, index) => {
		const item = items[index];
		if (item === undefined) return itemData;
		return {
			...itemData,
			src: item.src,
			width: item.width ?? 0,
			height: item.height ?? 0,
		};
	});
	applyPhotoSwipeLoadedSize(lightbox);
	applyPhotoSwipeBackGesture(lightbox);
	if (videoAt !== undefined) applyPhotoSwipeVideo(lightbox, videoAt);
	configure?.(lightbox);
	lightbox.on("closingAnimationEnd", onClosed);
	signal.addEventListener("abort", () => lightbox.destroy(), { once: true });
	lightbox.init();
	lightbox.loadAndOpen(index);
}
