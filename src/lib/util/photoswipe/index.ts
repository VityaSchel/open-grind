import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { backGestureEventHandlers } from "#lib/platform/back-gesture-event.svelte.ts";
import type { MediaDimensions } from "#lib/util/media-dimensions.ts";
import { applyPhotoSwipeErrorUi } from "./error-ui";
import { trackPhotoSwipeBusy } from "./open-tracking";
import { applyPhotoSwipeRoundedCrops } from "./rounded-crop";
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

export const ZOOM_SVG = `<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 256 256" width="32" height="32"><path d="M156,112a12,12,0,0,1-12,12H80a12,12,0,0,1,0-24h64A12,12,0,0,1,156,112Zm76.49,120.49a12,12,0,0,1-17,0L168,185a92.12,92.12,0,1,1,17-17l47.54,47.53A12,12,0,0,1,232.49,232.49ZM112,180a68,68,0,1,0-68-68A68.08,68.08,0,0,0,112,180Z"/><rect class="pswp__zoom-icn-bar-v" x="100" y="68" width="24" height="88" rx="12"/></svg>`;

export type LightboxItem = {
	src: string;
	element?: HTMLElement;
	msrc?: string;
	thumbCropped?: boolean;
} & Partial<MediaDimensions>;

const ZOOM_ANIMATION_MS = 500;

export async function openLightbox({
	items,
	index = 0,
	videoAt,
	animation = "fade",
	configure,
	signal,
	onClosed,
}: {
	items: LightboxItem[];
	index?: number;
	videoAt?: (index: number) => VideoSlide | null;
	animation?: "fade" | "zoom";
	configure?: (lightbox: PhotoSwipeLightbox) => void;
	signal: AbortSignal;
	onClosed: () => void;
}): Promise<void> {
	const release = trackPhotoSwipeBusy();
	const { default: Lightbox } = await import("photoswipe/lightbox").catch(
		(error: unknown) => {
			release();
			throw error;
		},
	);
	if (signal.aborted) {
		release();
		return;
	}
	const lightbox = new Lightbox({
		showHideAnimationType: animation,
		...(animation === "zoom" && {
			showAnimationDuration: ZOOM_ANIMATION_MS,
			hideAnimationDuration: ZOOM_ANIMATION_MS,
		}),
		pswpModule: () =>
			import("photoswipe").catch((error: unknown) => {
				release();
				throw error;
			}),
		mainClass: "pswp--buttons-visible",
		closeSVG: CLOSE_SVG,
		zoomSVG: ZOOM_SVG,
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
			element: item.element,
			msrc: item.msrc,
			thumbCropped: item.thumbCropped,
		};
	});
	applyPhotoSwipeLoadedSize(lightbox);
	applyPhotoSwipeBackGesture(lightbox);
	if (animation === "zoom") applyPhotoSwipeRoundedCrops(lightbox);
	if (videoAt !== undefined) applyPhotoSwipeVideo(lightbox, videoAt);
	try {
		configure?.(lightbox);
	} catch (error) {
		release();
		throw error;
	}
	lightbox.on("closingAnimationEnd", onClosed);
	lightbox.on("destroy", release);
	signal.addEventListener(
		"abort",
		() => {
			release();
			lightbox.destroy();
		},
		{ once: true },
	);
	lightbox.init();
	lightbox.loadAndOpen(index);
}
