import "./right-now-viewer.css";

import { type ComponentProps, mount, unmount } from "svelte";
import type PhotoSwipe from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { fullImageSizeInTime } from "#lib/util/photoswipe/full-size.ts";
import {
	applyPhotoSwipeComponent,
	openLightbox,
} from "#lib/util/photoswipe/index.ts";
import { trackPhotoSwipeBusy } from "#lib/util/photoswipe/open-tracking.ts";
import { reservePhotoSwipeBottom } from "#lib/util/photoswipe/sizing.ts";
import RightNowPostCaption from "./RightNowPostCaption.svelte";
import RightNowPostViewerAction from "./RightNowPostViewerAction.svelte";

type PostCaption = Omit<ComponentProps<typeof RightNowPostCaption>, "centered">;

type PostActions = {
	own: boolean;
	onreport: (viewer: { closeViewer: () => void }) => Promise<void>;
	onedit: () => void;
};

export function applyPhotoSwipeCaption(
	lightbox: PhotoSwipeLightbox,
	{ caption }: { caption: PostCaption },
): void {
	let panel: HTMLElement | undefined;
	reservePhotoSwipeBottom(lightbox, {
		height: () => panel?.getBoundingClientRect().height ?? 0,
	});
	lightbox.on("uiRegister", () => {
		lightbox.pswp?.ui?.registerElement({
			name: "caption-panel",
			appendTo: "root",
			onInit: (element, pswp) => {
				panel = element;
				const component = mount(RightNowPostCaption, {
					target: element,
					props: caption,
				});
				const resize = new ResizeObserver(() => pswp.updateSize(true));
				resize.observe(element);
				pswp.on("destroy", () => {
					resize.disconnect();
					panel = undefined;
					void unmount(component);
				});
			},
		});
	});
}

export function applyPhotoSwipeBarAction(
	lightbox: PhotoSwipeLightbox,
	{ own, onreport, onedit }: PostActions,
): void {
	lightbox.on("uiRegister", () => {
		lightbox.pswp?.ui?.registerElement({
			name: "bar-action",
			order: 15,
			appendTo: "bar",
			onInit: (element, pswp) => {
				const component = mount(RightNowPostViewerAction, {
					target: element,
					props: {
						own,
						onreport: () =>
							onreport({
								closeViewer: () => closeWhenOpen(pswp),
							}),
						onedit: () => {
							closeWhenOpen(pswp);
							onedit();
						},
					},
				});
				pswp.on("destroy", () => void unmount(component));
			},
		});
	});
}

export function closeWhenOpen(pswp: PhotoSwipe): void {
	if (pswp.opener.isOpen) pswp.close();
	else pswp.on("openingAnimationEnd", () => pswp.close());
}

export async function openRightNowPostViewer({
	src,
	frame,
	caption,
	own,
	onreport,
	onedit,
	signal,
	onClosed,
}: {
	src: string | null;
	frame: HTMLElement | null;
	caption: PostCaption;
	signal: AbortSignal;
	onClosed: () => void;
} & PostActions): Promise<void> {
	const release = trackPhotoSwipeBusy();
	signal.addEventListener("abort", release, { once: true });
	try {
		const size = src === null ? null : await fullImageSizeInTime(src);
		if (signal.aborted) return;
		return openLightbox({
			items: [
				src === null
					? { src: "" }
					: {
							src,
							...size,
							element: frame ?? undefined,
							msrc: size === null ? undefined : src,
							thumbCropped: true,
						},
			],
			animation: size === null || frame === null ? "fade" : "zoom",
			configure: (lightbox) => {
				lightbox.options.bgOpacity = 1;
				if (frame !== null && src !== null) {
					const hideFrame = () => (frame.style.visibility = "hidden");
					lightbox.on("openingAnimationStart", hideFrame);
					lightbox.on("closingAnimationStart", hideFrame);
					lightbox.on("destroy", () => (frame.style.visibility = ""));
				}
				if (src === null)
					applyPhotoSwipeComponent(lightbox, {
						slideAt: () => caption,
						render: ({ target, slide, content }) => {
							target.classList.add("pointer-events-none");
							const component = mount(RightNowPostCaption, {
								target,
								props: { ...slide, centered: true },
							});
							content.onLoaded();
							return component;
						},
					});
				else applyPhotoSwipeCaption(lightbox, { caption });
				applyPhotoSwipeBarAction(lightbox, { own, onreport, onedit });
			},
			signal,
			onClosed,
		});
	} finally {
		release();
	}
}
