import "./right-now-viewer.css";

import { unmount } from "svelte";
import type PhotoSwipe from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { reservePhotoSwipeBottom } from "#lib/util/photoswipe/sizing.ts";

type Render = (mount: {
	target: HTMLElement;
	pswp: PhotoSwipe;
}) => Record<string, unknown>;

export function applyPhotoSwipeCaption(
	lightbox: PhotoSwipeLightbox,
	{ render }: { render: Render },
): void {
	let caption: HTMLElement | undefined;
	reservePhotoSwipeBottom(lightbox, {
		height: () => caption?.getBoundingClientRect().height ?? 0,
	});
	lightbox.on("uiRegister", () => {
		lightbox.pswp?.ui?.registerElement({
			name: "caption-panel",
			appendTo: "root",
			onInit: (element, pswp) => {
				caption = element;
				const component = render({ target: element, pswp });
				const resize = new ResizeObserver(() => pswp.updateSize(true));
				resize.observe(element);
				pswp.on("destroy", () => {
					resize.disconnect();
					caption = undefined;
					void unmount(component);
				});
			},
		});
	});
}

export function applyPhotoSwipeBarAction(
	lightbox: PhotoSwipeLightbox,
	{ render }: { render: Render },
): void {
	lightbox.on("uiRegister", () => {
		lightbox.pswp?.ui?.registerElement({
			name: "bar-action",
			order: 15,
			appendTo: "bar",
			onInit: (element, pswp) => {
				const component = render({ target: element, pswp });
				pswp.on("destroy", () => void unmount(component));
			},
		});
	});
}

export function closeWhenOpen(pswp: PhotoSwipe): void {
	if (pswp.opener.isOpen) pswp.close();
	else pswp.on("openingAnimationEnd", () => pswp.close());
}
