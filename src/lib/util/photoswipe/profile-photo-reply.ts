import type PhotoSwipe from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { applyPhotoSwipeReply } from "./reply";

export function applyProfilePhotoReply(
	lightbox: PhotoSwipeLightbox,
	{
		imageHash,
		onreply,
	}: {
		imageHash: (pswp: PhotoSwipe) => string | undefined;
		onreply: (reply: { imageHash: string; text: string }) => void;
	},
): () => void {
	return applyPhotoSwipeReply(lightbox, {
		label: "Reply to profile photo",
		canReply: (pswp) => !!imageHash(pswp),
		visible: (pswp) => !!imageHash(pswp),
		onreply: ({ text, pswp }) => {
			const hash = imageHash(pswp);
			if (!hash) return;
			return () => onreply({ imageHash: hash, text });
		},
	});
}
