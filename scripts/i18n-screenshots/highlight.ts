import type { KeyBox, KeySource } from "../../src/lib/demo/screenshot-scan";
import { CHANNELS, type Pixels } from "./encode";

const GAP = 3;
const BLACK = [0, 0, 0, 255] as const;
const YELLOW = [255, 255, 0, 255] as const;
const BANDS = [BLACK, YELLOW, YELLOW, YELLOW, YELLOW, BLACK] as const;

type Bounds = { left: number; top: number; right: number; bottom: number };

function sameBox(a: KeyBox, b: KeyBox): boolean {
	return (
		a.x === b.x &&
		a.y === b.y &&
		a.width === b.width &&
		a.height === b.height
	);
}

function encloses({ outer, inner }: { outer: KeyBox; inner: KeyBox }): boolean {
	return (
		outer.x <= inner.x &&
		outer.y <= inner.y &&
		outer.x + outer.width >= inner.x + inner.width &&
		outer.y + outer.height >= inner.y + inner.height
	);
}

function inside({ x, y, box }: { x: number; y: number; box: KeyBox }): boolean {
	return (
		x >= box.x &&
		x < box.x + box.width &&
		y >= box.y &&
		y < box.y + box.height
	);
}

export function occurrences(boxes: KeyBox[]): KeyBox[] {
	const distinct = boxes.filter(
		(box, index) =>
			boxes.findIndex((other) => sameBox(box, other)) === index,
	);
	return distinct
		.filter(
			(outer) =>
				!distinct.some(
					(inner) => inner !== outer && encloses({ outer, inner }),
				),
		)
		.sort(
			(a, b) =>
				a.y - b.y ||
				a.x - b.x ||
				a.width - b.width ||
				a.height - b.height,
		);
}

function ringAround(box: KeyBox): Bounds {
	const reach = GAP + BANDS.length;
	return {
		left: box.x - reach,
		top: box.y - reach,
		right: box.x + box.width + reach,
		bottom: box.y + box.height + reach,
	};
}

function clampedInside({
	bounds: { left, top, right, bottom },
	width,
	height,
}: {
	bounds: Bounds;
	width: number;
	height: number;
}): Bounds {
	return {
		left: Math.min(Math.max(left, 0), width),
		top: Math.min(Math.max(top, 0), height),
		right: Math.max(Math.min(right, width), 0),
		bottom: Math.max(Math.min(bottom, height), 0),
	};
}

type Color = (typeof BANDS)[number];

function paintOutline({
	pixels: { data, width, height },
	bounds: { left, top, right, bottom },
	color,
	keepClear,
}: {
	pixels: Pixels;
	bounds: Bounds;
	color: Color;
	keepClear: KeyBox[];
}): void {
	const paint = (x: number, y: number) => {
		if (x < 0 || y < 0 || x >= width || y >= height) return;
		if (keepClear.some((box) => inside({ x, y, box }))) return;
		data.set(color, (y * width + x) * CHANNELS);
	};
	if (right <= left || bottom <= top) return;
	for (let x = Math.max(left, 0); x < Math.min(right, width); x += 1) {
		paint(x, top);
		paint(x, bottom - 1);
	}
	for (
		let y = Math.max(top + 1, 0);
		y < Math.min(bottom - 1, height);
		y += 1
	) {
		paint(left, y);
		paint(right - 1, y);
	}
}

function inset({ bounds, by }: { bounds: Bounds; by: number }): Bounds {
	return {
		left: bounds.left + by,
		top: bounds.top + by,
		right: bounds.right - by,
		bottom: bounds.bottom - by,
	};
}

export function drawHighlight({
	pixels,
	boxes,
	via,
}: {
	pixels: Pixels;
	boxes: KeyBox[];
	via: KeySource;
}): Pixels {
	const { width, height } = pixels;
	if (pixels.data.byteLength !== width * height * CHANNELS) {
		throw new Error(`Expected ${width}x${height} RGBA pixels`);
	}
	const highlighted = { width, height, data: Buffer.from(pixels.data) };
	const shown = occurrences(boxes);
	for (const box of shown) {
		const outside = ringAround(box);
		const ring =
			via === "text"
				? outside
				: clampedInside({ bounds: outside, width, height });
		const keepClear = shown.filter((other) => other !== box);
		for (const [depth, color] of BANDS.entries()) {
			paintOutline({
				pixels: highlighted,
				bounds: inset({ bounds: ring, by: depth }),
				color,
				keepClear,
			});
		}
	}
	return highlighted;
}
