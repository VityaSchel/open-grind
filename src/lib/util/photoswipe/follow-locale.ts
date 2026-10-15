import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { followLocale } from "$lib/i18n";

export function followLocaleWhileOpen({
	lightbox,
	apply,
}: {
	lightbox: PhotoSwipeLightbox;
	apply: () => void;
}): void {
	let stopFollowing: (() => void) | undefined;
	lightbox.on("beforeOpen", () => {
		stopFollowing = followLocale(apply);
	});
	lightbox.on("destroy", () => {
		stopFollowing?.();
		stopFollowing = undefined;
	});
}
