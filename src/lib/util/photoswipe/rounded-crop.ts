import type PhotoSwipe from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

const UNCROPPED = "inset(0% 0% 0% 0% round 0% / 0%)";

function percent(fraction: number): string {
	return `${(fraction * 100).toFixed(4)}%`;
}

function cornerRadius(element: HTMLElement | undefined): number {
	if (element === undefined) return 0;
	return parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
}

function animateCrop(
	pswp: PhotoSwipe,
	{ from, to, keep }: { from: string; to: string; keep: boolean },
): void {
	const duration = parseFloat(
		pswp.element?.style.getPropertyValue("--pswp-transition-duration") ??
			"",
	);
	if (!(duration > 0)) return;
	const slide = pswp.currSlide;
	const targets = [slide?.getPlaceholderElement(), slide?.content.element];
	for (const target of targets) {
		if (!(target instanceof HTMLElement)) continue;
		const animation = target.animate(
			[{ clipPath: from }, { clipPath: to }],
			{ duration, easing: pswp.options.easing, fill: "both" },
		);
		if (!keep)
			void animation.finished.then(
				() => animation.cancel(),
				() => {},
			);
	}
}

export function applyPhotoSwipeRoundedCrops(
	lightbox: PhotoSwipeLightbox,
): void {
	let crop: string | null = null;
	lightbox.addFilter("thumbBounds", (bounds, itemData) => {
		crop = null;
		const width = itemData.width ?? 0;
		const height = itemData.height ?? 0;
		if (bounds?.innerRect === undefined || width === 0 || height === 0)
			return bounds!;
		const { x, y, w, innerRect } = bounds;
		const h = (w * height) / width;
		const left = -innerRect.x;
		const top = -innerRect.y;
		const right = w - left - innerRect.w;
		const bottom = h - top - innerRect.h;
		const radius = cornerRadius(itemData.element);
		crop = `inset(${percent(top / h)} ${percent(right / w)} ${percent(bottom / h)} ${percent(left / w)} round ${percent(radius / w)} / ${percent(radius / h)})`;
		return { x, y, w };
	});
	lightbox.on("openingAnimationStart", () => {
		if (crop !== null && lightbox.pswp)
			animateCrop(lightbox.pswp, {
				from: crop,
				to: UNCROPPED,
				keep: false,
			});
	});
	lightbox.on("closingAnimationStart", () => {
		if (crop !== null && lightbox.pswp)
			animateCrop(lightbox.pswp, {
				from: UNCROPPED,
				to: crop,
				keep: true,
			});
	});
}
