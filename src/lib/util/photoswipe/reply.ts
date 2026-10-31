import { flushSync, mount, unmount } from "svelte";
import type PhotoSwipe from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import ReplyComposer from "$lib/components/shared/ReplyComposer.svelte";
import { safeAreaInsets } from "$lib/util/safe-area";
import { applyPhotoSwipeSafeAreaSync } from "./sizing";

export function applyPhotoSwipeReply(
	lightbox: PhotoSwipeLightbox,
	{
		label,
		onreply,
		onreact,
		canReply,
		hasReacted,
		visible,
		signal,
	}: {
		label: string;
		onreply?: (reply: {
			text: string;
			pswp: PhotoSwipe;
		}) => (() => void) | undefined;
		onreact?: (pswp: PhotoSwipe) => void;
		canReply: (pswp: PhotoSwipe) => boolean;
		hasReacted?: (pswp: PhotoSwipe) => boolean;
		visible?: (pswp: PhotoSwipe) => boolean;
		signal?: AbortSignal;
	},
): () => void {
	let refresh = () => {};
	applyPhotoSwipeSafeAreaSync(lightbox);
	const imageClickAction =
		lightbox.options.imageClickAction ?? "zoom-or-close";
	const paddingFn = lightbox.options.paddingFn;
	lightbox.options.paddingFn = (viewport, item, index) => {
		const composer = lightbox.pswp?.element?.querySelector<HTMLElement>(
			".pswp__reply-composer",
		);
		const padding = paddingFn?.(viewport, item, index) ??
			lightbox.options.padding ?? {
				top: 0,
				right: 0,
				bottom: 0,
				left: 0,
			};
		const height = composer?.getBoundingClientRect().height ?? 0;
		lightbox.pswp?.element?.style.setProperty(
			"--pswp-reply-composer-height",
			`${height}px`,
		);
		return {
			...padding,
			bottom:
				composer && !composer.hidden
					? Math.max(padding.bottom, safeAreaInsets().bottom) + height
					: padding.bottom,
		};
	};
	lightbox.on("uiRegister", () => {
		lightbox.pswp?.ui?.registerElement({
			name: "reply-composer",
			appendTo: "root",
			onInit: (element, pswp) => {
				element.setAttribute("data-pswp-interactive", "");
				let deliver: (() => void) | undefined;
				const available = () => pswp.opener.isOpen && canReply(pswp);
				const composer = mount(ReplyComposer, {
					target: element,
					props: {
						label,
						allowReply: !!onreply,
						allowReaction: !!onreact,
						onsubmit: (text) => {
							if (!available()) return;
							if (!text) {
								if (hasReacted?.(pswp)) return;
								onreact?.(pswp);
								refresh();
								return;
							}
							deliver = onreply?.({ text, pswp });
							if (deliver) pswp.close();
						},
					},
				});
				refresh = () => {
					element.hidden = visible !== undefined && !visible(pswp);
					if (visible)
						pswp.options.imageClickAction = element.hidden
							? imageClickAction
							: "zoom";
					composer.update({
						enabled: available(),
						reactionSent: hasReacted?.(pswp),
					});
					pswp.updateSize(true);
				};
				refresh();
				pswp.on("firstUpdate", () => {
					flushSync();
					refresh();
				});
				const resize = new ResizeObserver(() => pswp.updateSize(true));
				resize.observe(element);
				pswp.on("openingAnimationEnd", refresh);
				pswp.on("change", () => {
					composer.update({ enabled: available(), reset: true });
					refresh();
				});
				pswp.on("closingAnimationEnd", () => {
					const reply = deliver;
					deliver = undefined;
					if (!signal?.aborted) reply?.();
				});
				pswp.on("destroy", () => {
					resize.disconnect();
					deliver = undefined;
					refresh = () => {};
					void unmount(composer);
				});
			},
		});
	});
	return () => refresh();
}
