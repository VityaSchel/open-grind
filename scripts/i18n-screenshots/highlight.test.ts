import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { KeyBox } from "../../src/lib/demo/screenshot-scan";
import { encodeView, type Pixels } from "./encode";
import { drawHighlight, occurrences } from "./highlight";

const GRAY = [128, 128, 128, 255];
const NAMES = new Map([
	["0,0,0,255", "black"],
	["255,255,0,255", "yellow"],
	[GRAY.join(), "gray"],
]);
const LOSSY_TOLERANCE = 40;
const RING_OUTWARD = [
	"gray",
	"gray",
	"gray",
	"black",
	"yellow",
	"yellow",
	"yellow",
	"yellow",
	"black",
	"gray",
];

function grayImage({ width, height }: { width: number; height: number }) {
	const data = Buffer.alloc(width * height * 4);
	for (let pixel = 0; pixel < width * height; pixel += 1) {
		data.set(GRAY, pixel * 4);
	}
	return { data, width, height };
}

function noiseImage({ width, height }: { width: number; height: number }) {
	const data = Buffer.alloc(width * height * 4);
	let seed = 7;
	for (let index = 0; index < data.length; index += 1) {
		seed = (seed * 48271) % 2147483647;
		data[index] = index % 4 === 3 ? 255 : seed % 256;
	}
	return { data, width, height };
}

function colorAt({ pixels, x, y }: { pixels: Pixels; x: number; y: number }) {
	const offset = (y * pixels.width + x) * 4;
	const rgba = [...pixels.data.subarray(offset, offset + 4)].join();
	return NAMES.get(rgba) ?? rgba;
}

function row({
	pixels,
	y,
	xs,
}: {
	pixels: Pixels;
	y: number;
	xs: number[];
}): string[] {
	return xs.map((x) => colorAt({ pixels, x, y }));
}

function column({
	pixels,
	x,
	ys,
}: {
	pixels: Pixels;
	x: number;
	ys: number[];
}): string[] {
	return ys.map((y) => colorAt({ pixels, x, y }));
}

function steps({
	from,
	by,
	count,
}: {
	from: number;
	by: number;
	count: number;
}) {
	return Array.from({ length: count }, (_, step) => from + step * by);
}

function changedPixels({ before, after }: { before: Pixels; after: Pixels }) {
	const changed: [number, number][] = [];
	for (let y = 0; y < before.height; y += 1) {
		for (let x = 0; x < before.width; x += 1) {
			const offset = (y * before.width + x) * 4;
			if (
				!before.data
					.subarray(offset, offset + 4)
					.equals(after.data.subarray(offset, offset + 4))
			) {
				changed.push([x, y]);
			}
		}
	}
	return changed;
}

function within({
	point: [x, y],
	box,
}: {
	point: [number, number];
	box: KeyBox;
}) {
	return (
		x >= box.x &&
		x < box.x + box.width &&
		y >= box.y &&
		y < box.y + box.height
	);
}

async function decode(webp: Buffer): Promise<Pixels> {
	const { data, info } = await sharp(webp)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	return { data, width: info.width, height: info.height };
}

describe("drawHighlight", () => {
	const box = { x: 40, y: 30, width: 20, height: 10 };

	it("leaves a 3 px gap, then 1 black, 4 yellow and 1 black pixels on every side", () => {
		const pixels = drawHighlight({
			pixels: grayImage({ width: 100, height: 80 }),
			boxes: [box],
			via: "text",
		});

		expect(
			row({ pixels, y: 35, xs: steps({ from: 39, by: -1, count: 10 }) }),
		).toEqual(RING_OUTWARD);
		expect(
			row({ pixels, y: 35, xs: steps({ from: 60, by: 1, count: 10 }) }),
		).toEqual(RING_OUTWARD);
		expect(
			column({
				pixels,
				x: 50,
				ys: steps({ from: 29, by: -1, count: 10 }),
			}),
		).toEqual(RING_OUTWARD);
		expect(
			column({
				pixels,
				x: 50,
				ys: steps({ from: 40, by: 1, count: 10 }),
			}),
		).toEqual(RING_OUTWARD);
	});

	it("covers no pixel of the box and leaves the input untouched", () => {
		const input = grayImage({ width: 100, height: 80 });
		const pixels = drawHighlight({
			pixels: input,
			boxes: [box],
			via: "text",
		});

		const changed = changedPixels({ before: input, after: pixels });
		expect(changed).toHaveLength(38 * 28 - 26 * 16);
		expect(changed.filter((point) => within({ point, box }))).toEqual([]);
		expect(
			changedPixels({
				before: grayImage({ width: 100, height: 80 }),
				after: input,
			}),
		).toEqual([]);
	});

	it("cuts a text box's ring off at the image edge instead of covering the text", () => {
		const cornerBox = { x: 0, y: 0, width: 30, height: 10 };
		const input = grayImage({ width: 100, height: 80 });
		const pixels = drawHighlight({
			pixels: input,
			boxes: [cornerBox],
			via: "text",
		});

		const changed = changedPixels({ before: input, after: pixels });
		expect(
			changed.filter((point) => within({ point, box: cornerBox })),
		).toEqual([]);
		expect(changed).toHaveLength(39 * 19 - 33 * 13);
		expect(
			row({ pixels, y: 5, xs: steps({ from: 29, by: 1, count: 11 }) }),
		).toEqual(["gray", ...RING_OUTWARD]);
		expect(
			column({ pixels, x: 15, ys: steps({ from: 9, by: 1, count: 11 }) }),
		).toEqual(["gray", ...RING_OUTWARD]);
		expect(
			column({ pixels, x: 0, ys: steps({ from: 12, by: 1, count: 8 }) }),
		).toEqual(RING_OUTWARD.slice(2));
	});

	it("draws nothing for a text box that fills the image", () => {
		const input = grayImage({ width: 50, height: 40 });
		const pixels = drawHighlight({
			pixels: input,
			boxes: [{ x: 0, y: 0, width: 50, height: 40 }],
			via: "text",
		});

		expect(changedPixels({ before: input, after: pixels })).toEqual([]);
	});

	it("moves an attribute-only element's ring inside the image at its edges", () => {
		const pixels = drawHighlight({
			pixels: grayImage({ width: 100, height: 80 }),
			boxes: [{ x: 0, y: 0, width: 30, height: 10 }],
			via: "attribute",
		});

		const band = [
			"black",
			"yellow",
			"yellow",
			"yellow",
			"yellow",
			"black",
			"gray",
		];
		expect(
			row({ pixels, y: 8, xs: steps({ from: 0, by: 1, count: 7 }) }),
		).toEqual(band);
		expect(
			column({ pixels, x: 15, ys: steps({ from: 0, by: 1, count: 7 }) }),
		).toEqual(band);
		expect(
			row({ pixels, y: 8, xs: steps({ from: 29, by: 1, count: 11 }) }),
		).toEqual(["gray", ...RING_OUTWARD]);
		expect(
			column({ pixels, x: 15, ys: steps({ from: 9, by: 1, count: 11 }) }),
		).toEqual(["gray", ...RING_OUTWARD]);
	});

	it("frames the image itself for an attribute-only element that fills it", () => {
		const pixels = drawHighlight({
			pixels: grayImage({ width: 50, height: 40 }),
			boxes: [{ x: 0, y: 0, width: 50, height: 40 }],
			via: "attribute",
		});

		const band = [
			"black",
			"yellow",
			"yellow",
			"yellow",
			"yellow",
			"black",
			"gray",
		];
		expect(
			row({ pixels, y: 20, xs: steps({ from: 0, by: 1, count: 7 }) }),
		).toEqual(band);
		expect(
			row({ pixels, y: 20, xs: steps({ from: 49, by: -1, count: 7 }) }),
		).toEqual(band);
		expect(
			column({
				pixels,
				x: 25,
				ys: steps({ from: 39, by: -1, count: 7 }),
			}),
		).toEqual(band);
	});

	it("rings a tiny box with its gap intact", () => {
		const pixels = drawHighlight({
			pixels: grayImage({ width: 40, height: 40 }),
			boxes: [{ x: 20, y: 20, width: 1, height: 0 }],
			via: "text",
		});

		expect(
			row({ pixels, y: 20, xs: steps({ from: 20, by: -1, count: 11 }) }),
		).toEqual(["gray", ...RING_OUTWARD]);
		expect(
			row({ pixels, y: 20, xs: steps({ from: 21, by: 1, count: 10 }) }),
		).toEqual(RING_OUTWARD);
		expect(
			column({
				pixels,
				x: 20,
				ys: steps({ from: 19, by: -1, count: 10 }),
			}),
		).toEqual(RING_OUTWARD);
		expect(
			column({
				pixels,
				x: 20,
				ys: steps({ from: 20, by: 1, count: 10 }),
			}),
		).toEqual(RING_OUTWARD);
	});

	it("rings each occurrence apart instead of their union", () => {
		const first = { x: 10, y: 10, width: 20, height: 10 };
		const second = { x: 70, y: 60, width: 20, height: 10 };
		const pixels = drawHighlight({
			pixels: grayImage({ width: 100, height: 80 }),
			boxes: [second, first],
			via: "text",
		});

		expect(
			row({ pixels, y: 15, xs: steps({ from: 30, by: 1, count: 10 }) }),
		).toEqual(RING_OUTWARD);
		expect(
			row({ pixels, y: 65, xs: steps({ from: 69, by: -1, count: 10 }) }),
		).toEqual(RING_OUTWARD);
		expect(colorAt({ pixels, x: 10 - 9, y: 65 })).toBe("gray");
		expect(colorAt({ pixels, x: 90 + 8, y: 15 })).toBe("gray");
	});

	it("keeps a ring off a neighboring occurrence", () => {
		const upper = { x: 10, y: 10, width: 30, height: 10 };
		const lower = { x: 10, y: 24, width: 30, height: 10 };
		const input = grayImage({ width: 60, height: 50 });
		const pixels = drawHighlight({
			pixels: input,
			boxes: [upper, lower],
			via: "text",
		});

		const changed = changedPixels({ before: input, after: pixels });
		expect(
			changed.filter((point) => within({ point, box: lower })),
		).toEqual([]);
		expect(
			changed.filter((point) => within({ point, box: upper })),
		).toEqual([]);
		expect(column({ pixels, x: 25, ys: [20, 21, 22, 23] })).toEqual([
			"black",
			"gray",
			"gray",
			"black",
		]);
	});
});

describe("occurrences", () => {
	it("drops repeats and boxes that enclose another occurrence, in reading order", () => {
		const text = { x: 50, y: 10, width: 20, height: 8 };
		const button = { x: 44, y: 4, width: 32, height: 20 };
		const later = { x: 5, y: 40, width: 20, height: 8 };

		expect(occurrences([later, button, text, { ...text }])).toEqual([
			text,
			later,
		]);
	});
});

function channelDistance({
	decoded,
	drawn,
	x,
	y,
}: {
	decoded: Pixels;
	drawn: Pixels;
	x: number;
	y: number;
}): number {
	const offset = (y * drawn.width + x) * 4;
	return Math.max(
		...[0, 1, 2].map((channel) =>
			Math.abs(
				(decoded.data[offset + channel] ?? Number.NaN) -
					(drawn.data[offset + channel] ?? Number.NaN),
			),
		),
	);
}

describe("encodeView on a highlight", () => {
	const ringed = { x: 30, y: 30, width: 40, height: 20 };

	it("keeps the ring #FFFF00 and #000000 through the lossy encoding", async () => {
		const drawn = drawHighlight({
			pixels: grayImage({ width: 120, height: 90 }),
			boxes: [ringed],
			via: "text",
		});
		const { webp, pixelHash } = await encodeView(drawn);
		const decoded = await decode(webp);

		const outward = steps({ from: 29, by: -1, count: 10 });
		expect(row({ pixels: drawn, y: 40, xs: outward })).toEqual(
			RING_OUTWARD,
		);
		expect(column({ pixels: drawn, x: 50, ys: outward })).toEqual(
			RING_OUTWARD,
		);
		expect(
			outward.filter(
				(x) =>
					!(
						channelDistance({ decoded, drawn, x, y: 40 }) <=
						LOSSY_TOLERANCE
					),
			),
		).toEqual([]);
		expect(
			outward.filter(
				(y) =>
					!(
						channelDistance({ decoded, drawn, x: 50, y }) <=
						LOSSY_TOLERANCE
					),
			),
		).toEqual([]);
		expect(pixelHash).toBe(
			createHash("sha256")
				.update("120x90\n")
				.update(drawn.data)
				.digest("hex"),
		);
	});

	it("gives byte-identical output for the same input", async () => {
		const input = noiseImage({ width: 120, height: 90 });
		const [first, second] = await Promise.all([
			encodeView(
				drawHighlight({ pixels: input, boxes: [ringed], via: "text" }),
			),
			encodeView(
				drawHighlight({
					pixels: noiseImage({ width: 120, height: 90 }),
					boxes: [{ ...ringed }],
					via: "text",
				}),
			),
		]);

		expect(first.webp.equals(second.webp)).toBe(true);
		expect(first.sha256).toBe(second.sha256);
	});
});
