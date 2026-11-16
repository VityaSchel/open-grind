// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { Bounds, PhotoSwipeFiltersMap } from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { applyPhotoSwipeRoundedCrops } from "./rounded-crop";

type ThumbBoundsFilter = PhotoSwipeFiltersMap["thumbBounds"];

const UNCROPPED = "inset(0% 0% 0% 0% round 0% / 0%)";
const PORTRAIT_CROP =
	"inset(12.5000% 0.0000% 12.5000% 0.0000% round 20.0000% / 15.0000%)";
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
	it.each([
		{
			name: "a portrait photo",
			photo: PORTRAIT,
			bounds: SQUARE_THUMB_BOUNDS,
			crop: PORTRAIT_CROP,
		},
		{
			name: "a landscape photo",
			photo: { width: 800, height: 600 },
			bounds: {
				x: 240,
				y: 340,
				w: 320 / 3,
				innerRect: { x: -40 / 3, y: 0, w: 80, h: 80 },
			},
			crop: "inset(0.0000% 12.5000% 0.0000% 12.5000% round 15.0000% / 20.0000%)",
		},
	])(
		"zooms $name from its whole bounds, clipped to the thumbnail's crop and corners",
		({ photo, bounds, crop }) => {
			const { filters, handlers, placeholder } = fakeLightbox();

			const returned = filters.thumbBounds!(
				bounds,
				{ ...photo, element: thumbFrame("16px") },
				0,
			);
			handlers.openingAnimationStart!();

			expect(returned).toStrictEqual({
				x: bounds.x,
				y: bounds.y,
				w: bounds.w,
			});
			expect(placeholder.animate).toHaveBeenCalledExactlyOnceWith(
				[
					expect.objectContaining({ clipPath: crop }),
					{ clipPath: UNCROPPED },
				],
				expect.objectContaining({ duration: 500 }),
			);
		},
	);

	it("opens from the thumbnail's crop and corners, then drops the clip, easing on the first keyframe since WebKitGTK plays an effect-level easing as linear", async () => {
		const { filters, handlers, placeholder, image } = fakeLightbox();
		filters.thumbBounds!(
			SQUARE_THUMB_BOUNDS,
			{ ...PORTRAIT, element: thumbFrame("16px") },
			0,
		);

		handlers.openingAnimationStart!();

		for (const target of [placeholder, image]) {
			expect(target.animate).toHaveBeenCalledExactlyOnceWith(
				[
					{
						clipPath: PORTRAIT_CROP,
						easing: "cubic-bezier(.4,0,.22,1)",
					},
					{ clipPath: UNCROPPED },
				],
				{ duration: 500, fill: "both" },
			);
		}
		placeholder.finish();
		await vi.waitFor(() =>
			expect(placeholder.cancel).toHaveBeenCalledOnce(),
		);
	});

	it("closes into the thumbnail's crop and corners and keeps them until the viewer goes", async () => {
		const { filters, handlers, image } = fakeLightbox();
		filters.thumbBounds!(
			SQUARE_THUMB_BOUNDS,
			{ ...PORTRAIT, element: thumbFrame("16px") },
			0,
		);

		handlers.closingAnimationStart!();
		image.finish();
		await Promise.resolve();

		expect(image.animate).toHaveBeenCalledWith(
			[
				{ clipPath: UNCROPPED, easing: "cubic-bezier(.4,0,.22,1)" },
				{ clipPath: PORTRAIT_CROP },
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

		expect(filters.thumbBounds!(bounds, size, 0)).toBe(bounds);
		handlers.openingAnimationStart!();

		expect(placeholder.animate).not.toHaveBeenCalled();
	});

	it("does not animate when PhotoSwipe skips the transition", () => {
		const { filters, handlers, placeholder } = fakeLightbox({
			duration: "0ms",
		});
		filters.thumbBounds!(SQUARE_THUMB_BOUNDS, { ...PORTRAIT }, 0);

		handlers.openingAnimationStart!();

		expect(placeholder.animate).not.toHaveBeenCalled();
	});
});
