import { mount } from "svelte";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import VideoPlayer from "$lib/components/shared/VideoPlayer.svelte";
import { onSafeAreaChange, safeAreaInsets } from "$lib/util/safe-area";
import { applyPhotoSwipeComponent } from "./component";
import { type Failure, failures } from "./error-ui";

const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

export type VideoSlide = { src: string; poster: string | null; loop?: boolean };

function yieldToInteractiveContent(lightbox: PhotoSwipeLightbox): void {
	lightbox.on("pointerDown", (event) => {
		const { target } = event.originalEvent;
		if (
			target instanceof Element &&
			target.closest("[data-pswp-interactive]") !== null
		)
			event.preventDefault();
	});
	lightbox.on("keydown", (event) => {
		if (event.originalEvent.defaultPrevented) event.preventDefault();
	});
}

function fitVideosToSafeArea(
	lightbox: PhotoSwipeLightbox,
	isVideo: (index: number) => boolean,
): void {
	lightbox.addFilter("itemData", (itemData, index) =>
		isVideo(index) ? { ...itemData, type: "video" } : itemData,
	);
	lightbox.options.paddingFn = (_viewportSize, _itemData, index) =>
		isVideo(index) ? safeAreaInsets() : NO_PADDING;
	lightbox.on("calcSlideSize", ({ slide }) => {
		if (!isVideo(slide.index)) return;
		slide.width = slide.panAreaSize.x;
		slide.height = slide.panAreaSize.y;
		slide.zoomLevels.update(slide.width, slide.height, slide.panAreaSize);
	});
	let stopFollowing: (() => void) | undefined;
	lightbox.on("beforeOpen", () => {
		stopFollowing = onSafeAreaChange(() => lightbox.pswp?.updateSize(true));
	});
	lightbox.on("destroy", () => {
		stopFollowing?.();
		stopFollowing = undefined;
	});
}

export function applyPhotoSwipeVideo(
	lightbox: PhotoSwipeLightbox,
	videoAt: (index: number) => VideoSlide | null,
): void {
	yieldToInteractiveContent(lightbox);
	fitVideosToSafeArea(lightbox, (index) => videoAt(index) !== null);

	applyPhotoSwipeComponent(lightbox, {
		slideAt: videoAt,
		render: ({ target, slide, content }) =>
			mount(VideoPlayer, {
				target,
				props: {
					...slide,
					onready: () => content.onLoaded(),
					onfail: (failure: Failure) => {
						failures.set(content, failure);
						console.error(
							`[video] slide ${content.index} failed: ${failure.detail}`,
						);
						content.onError();
					},
				},
			}),
	});

	lightbox.on("contentActivate", ({ content }) => {
		content.element
			?.querySelector("video")
			?.play()
			.catch(() => {});
	});

	lightbox.on("contentDeactivate", ({ content }) => {
		content.element?.querySelector("video")?.pause();
	});
}
