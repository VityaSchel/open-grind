// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { applyPhotoSwipeRoundedCrops } from "./rounded-crop";

type Bounds = {
	x: number;
	y: number;
	w: number;
	innerRect?: { x: number; y: number; w: number; h: number };
};
type ItemData = { width?: number; height?: number; element?: HTMLElement };
type ThumbBoundsFilter = (
	bounds: Bounds | undefined,
	itemData: ItemData,
) => Bounds | undefined;

const PORTRAIT = { width: 600, height: 800 };
const SQUARE_THUMB_BOUNDS: Bounds = {
	x: 240,
	y: 340,
	w: 80,
	innerRect: { x: 0, y: -13.333333, w: 80, h: 80 },
};

function animatable() {
	const element = document.createElement("img");
	const cancel = vi.fn();
	let finish = () => {};
	const finished = new Promise<void>((resolve) => (finish = resolve));
	const animate = vi.fn(() => ({ finished, cancel }));
	Object.assign(element, { animate });
	return { element, animate, cancel, finish: () => finish() };
}

function fakeLightbox({ duration = "500ms" }: { duration?: string } = {}) {
	const filters: Record<string, ThumbBoundsFilter> = {};
	const handlers: Record<string, () => void> = {};
	const placeholder = animatable();
	const image = animatable();
	const root = document.createElement("div");
	root.style.setProperty("--pswp-transition-duration", duration);
	const lightbox = {
		addFilter: (name: string, filter: ThumbBoundsFilter) => {
			filters[name] = filter;
		},
		on: (name: string, handler: () => void) => {
			handlers[name] = handler;
		},
		pswp: {
			element: root,
			options: { easing: "cubic-bezier(.4,0,.22,1)" },
			currSlide: {
				getPlaceholderElement: () => placeholder.element,
				content: { element: image.element },
			},
		},
	};
	applyPhotoSwipeRoundedCrops(lightbox as unknown as PhotoSwipeLightbox);
	return { filters, handlers, placeholder, image };
}

function thumbFrame(radius: string) {
	const frame = document.createElement("div");
	frame.style.borderTopLeftRadius = radius;
	return frame;
}

describe("applyPhotoSwipeRoundedCrops", () => {
	it("zooms from the whole photo's bounds instead of PhotoSwipe's two-container crop", () => {
		const { filters } = fakeLightbox();

		const bounds = filters.thumbBounds!(SQUARE_THUMB_BOUNDS, {
			...PORTRAIT,
			element: thumbFrame("16px"),
		});

		expect(bounds).toStrictEqual({ x: 240, y: 340, w: 80 });
	});

	it("opens from the thumbnail's crop and corners, then drops the clip", async () => {
		const { filters, handlers, placeholder, image } = fakeLightbox();
		filters.thumbBounds!(SQUARE_THUMB_BOUNDS, {
			...PORTRAIT,
			element: thumbFrame("16px"),
		});

		handlers.openingAnimationStart!();

		for (const target of [placeholder, image]) {
			expect(target.animate).toHaveBeenCalledExactlyOnceWith(
				[
					{
						clipPath:
							"inset(12.5000% 0.0000% 12.5000% 0.0000% round 20.0000% / 15.0000%)",
					},
					{ clipPath: "inset(0% 0% 0% 0% round 0% / 0%)" },
				],
				{
					duration: 500,
					easing: "cubic-bezier(.4,0,.22,1)",
					fill: "both",
				},
			);
		}
		placeholder.finish();
		await vi.waitFor(() =>
			expect(placeholder.cancel).toHaveBeenCalledOnce(),
		);
	});

	it("closes into the thumbnail's crop and corners and keeps them until the viewer goes", async () => {
		const { filters, handlers, image } = fakeLightbox();
		filters.thumbBounds!(SQUARE_THUMB_BOUNDS, {
			...PORTRAIT,
			element: thumbFrame("16px"),
		});

		handlers.closingAnimationStart!();
		image.finish();
		await Promise.resolve();

		expect(image.animate).toHaveBeenCalledWith(
			[
				{ clipPath: "inset(0% 0% 0% 0% round 0% / 0%)" },
				{
					clipPath:
						"inset(12.5000% 0.0000% 12.5000% 0.0000% round 20.0000% / 15.0000%)",
				},
			],
			expect.objectContaining({ fill: "both" }),
		);
		expect(image.cancel).not.toHaveBeenCalled();
	});

	it.each([
		["the thumbnail is not cropped", { x: 240, y: 340, w: 80 }, PORTRAIT],
		[
			"the photo's size is unknown",
			SQUARE_THUMB_BOUNDS,
			{ width: 0, height: 0 },
		],
	])("leaves the bounds and the photo alone when %s", (_, bounds, size) => {
		const { filters, handlers, placeholder } = fakeLightbox();

		expect(filters.thumbBounds!(bounds, size)).toBe(bounds);
		handlers.openingAnimationStart!();

		expect(placeholder.animate).not.toHaveBeenCalled();
	});

	it("does not animate when PhotoSwipe skips the transition", () => {
		const { filters, handlers, placeholder } = fakeLightbox({
			duration: "0ms",
		});
		filters.thumbBounds!(SQUARE_THUMB_BOUNDS, { ...PORTRAIT });

		handlers.openingAnimationStart!();

		expect(placeholder.animate).not.toHaveBeenCalled();
	});
});
