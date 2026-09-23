import {
	applyPhotoSwipeBackGesture,
	applyPhotoSwipeErrorUi,
	applyPhotoSwipeVideo,
	applyPhotoSwipeViewportSync,
} from "$lib/util/photoswipe";
import type { MediaDimensions } from "$lib/util/media-dimensions";

export type LightboxVideo = { src: string; loop: boolean } & MediaDimensions;

export async function openVideoLightbox({
	video,
	signal,
	onClosed,
}: {
	video: LightboxVideo;
	signal: AbortSignal;
	onClosed: () => void;
}): Promise<void> {
	const { default: PhotoSwipeLightbox } = await import("photoswipe/lightbox");
	if (signal.aborted) return;
	const lightbox = new PhotoSwipeLightbox({
		showHideAnimationType: "fade",
		pswpModule: () => import("photoswipe"),
		mainClass: "pswp--buttons-visible",
	});
	applyPhotoSwipeErrorUi(lightbox);
	applyPhotoSwipeViewportSync(lightbox);
	lightbox.addFilter("numItems", () => 1);
	lightbox.addFilter("itemData", () => ({
		src: video.src,
		width: video.width,
		height: video.height,
	}));
	applyPhotoSwipeBackGesture(lightbox);
	applyPhotoSwipeVideo(lightbox, () => ({
		src: video.src,
		poster: null,
		loop: video.loop,
	}));
	lightbox.on("closingAnimationEnd", onClosed);
	signal.addEventListener("abort", () => lightbox.destroy(), { once: true });
	lightbox.init();
	lightbox.loadAndOpen(0);
}
