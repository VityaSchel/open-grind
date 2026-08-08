import { mount, unmount } from "svelte";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import VideoPlayer from "$lib/components/shared/VideoPlayer.svelte";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import "./photoswipe.css";

const BROKEN_MEDIA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="64" height="64" fill="var(--color-neutral-500)" style="display:block" aria-hidden="true"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16h64a8,8,0,0,0,7.59-5.47l14.83-44.48L163,151.43a8.07,8.07,0,0,0,4.46-4.46l14.62-36.55,44.48-14.83A8,8,0,0,0,232,88V56A16,16,0,0,0,216,40ZM117,152.57a8,8,0,0,0-4.62,4.9L98.23,200H40V160.69l46.34-46.35a8,8,0,0,1,11.32,0l32.84,32.84Zm115-30.84V200a16,16,0,0,1-16,16H137.73a8,8,0,0,1-7.59-10.53l7.94-23.8a8,8,0,0,1,4.61-4.9l35.77-14.31,14.31-35.77a8,8,0,0,1,4.9-4.61l23.8-7.94A8,8,0,0,1,232,121.73Z"/></svg>`;

export function applyPhotoSwipeErrorUi(lightbox: PhotoSwipeLightbox): void {
	lightbox.addFilter("contentErrorElement", (element) => {
		element.setAttribute("role", "img");
		element.setAttribute("aria-label", "Media failed to load");
		element.innerHTML = BROKEN_MEDIA_SVG;
		return element;
	});
}

export function applyPhotoSwipeBackGesture(lightbox: PhotoSwipeLightbox): void {
	const onBackGesture = () => {
		lightbox.pswp?.close();
		return false;
	};
	lightbox.on("beforeOpen", () => {
		backGestureEventHandlers.add(onBackGesture);
	});
	lightbox.on("close", () => {
		backGestureEventHandlers.delete(onBackGesture);
	});
}

type VideoSlide = { src: string; poster: string | null };

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

export function applyPhotoSwipeVideo(
	lightbox: PhotoSwipeLightbox,
	videoAt: (index: number) => VideoSlide | null,
): void {
	const players = new Map<HTMLElement, Record<string, unknown>>();

	yieldToInteractiveContent(lightbox);

	lightbox.addFilter("useContentPlaceholder", (usePlaceholder, content) =>
		videoAt(content.index) === null ? usePlaceholder : false,
	);

	lightbox.on("contentLoad", (event) => {
		const { content } = event;
		const video = videoAt(content.index);
		if (video === null) return;
		event.preventDefault();
		const element = document.createElement("div");
		element.className = "size-full";
		content.element = element;
		content.state = "loading";
		players.set(
			element,
			mount(VideoPlayer, {
				target: element,
				props: {
					...video,
					onready: () => content.onLoaded(),
					onfail: () => content.onError(),
					autoplay: true,
				},
			}),
		);
	});

	lightbox.on("contentDeactivate", ({ content }) => {
		content.element?.querySelector("video")?.pause();
	});

	lightbox.on("contentDestroy", ({ content }) => {
		const { element } = content;
		if (!element) return;
		const player = players.get(element);
		if (player === undefined) return;
		players.delete(element);
		void unmount(player);
	});
}

export function applyPhotoSwipeThumbDimensions(
	lightbox: PhotoSwipeLightbox,
): void {
	lightbox.addFilter("itemData", (itemData) => {
		const img = itemData.element?.querySelector("img");
		if (img?.naturalWidth) {
			itemData.width = img.naturalWidth;
			itemData.height = img.naturalHeight;
		}
		return itemData;
	});
}
