import { expect, type Locator, type Page } from "@playwright/test";

import { afterTwoFrames } from "./app";

export const DARK_SCRIM = 0.8;
const NO_EDGE = "0 0 #0000";
const VISIBLE_STEP = 8;

type Clip = { x: number; y: number; width: number; height: number };

export const scrimStrength = (dim: Locator) =>
	dim.evaluate((element) => {
		const { opacity, backgroundColor } = getComputedStyle(element);
		const [, , , alpha = 1] =
			backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
		return Number(opacity) * alpha;
	});

function columnsJustLeftOf(x: number): number[] {
	const first = Math.floor(x - 1);
	return Array.from(
		{ length: Math.ceil(x) - first },
		(_, index) => first + index,
	);
}

async function overrideStackEdge(
	page: Page,
	{ edge }: { edge: string | null },
) {
	await page.evaluate((edge) => {
		const root = document.documentElement.style;
		if (edge === null) root.removeProperty("--stack-edge");
		else root.setProperty("--stack-edge", edge);
	}, edge);
	await afterTwoFrames(page);
}

export async function edgeLineColumns(
	page: Page,
	{ clip }: { clip?: Clip } = {},
): Promise<number[]> {
	const shot = () => page.screenshot({ clip, caret: "hide" });
	const edged = await shot();
	await overrideStackEdge(page, { edge: NO_EDGE });
	const plain = await shot();
	await overrideStackEdge(page, { edge: null });

	return page.evaluate(
		async ({ edged, plain, step, left }) => {
			const decode = async (base64: string) => {
				const response = await fetch(`data:image/png;base64,${base64}`);
				const bitmap = await createImageBitmap(await response.blob());
				const context = new OffscreenCanvas(
					bitmap.width,
					bitmap.height,
				).getContext("2d");
				if (!context) throw new Error("no 2d context");
				context.drawImage(bitmap, 0, 0);
				return context.getImageData(0, 0, bitmap.width, bitmap.height);
			};
			const [withEdge, withoutEdge] = await Promise.all([
				decode(edged),
				decode(plain),
			]);
			const differs = (at: number) =>
				[0, 1, 2].some(
					(channel) =>
						Math.abs(
							(withEdge.data[at + channel] ?? 0) -
								(withoutEdge.data[at + channel] ?? 0),
						) > step,
				);
			const columns: number[] = [];
			for (let x = 0; x < withEdge.width; x++) {
				for (let y = 0; y < withEdge.height; y++) {
					if (!differs((y * withEdge.width + x) * 4)) continue;
					columns.push(left + x);
					break;
				}
			}
			return columns;
		},
		{
			edged: edged.toString("base64"),
			plain: plain.toString("base64"),
			step: VISIBLE_STEP,
			left: clip?.x ?? 0,
		},
	);
}

export async function expectEdgeJustLeftOf(
	page: Page,
	{ x, clip }: { x: number; clip?: Clip },
) {
	const edge = await edgeLineColumns(page, { clip });
	expect(edge, "an edge line shows").not.toHaveLength(0);
	expect(columnsJustLeftOf(x), "only along the pane's left side").toEqual(
		expect.arrayContaining(edge),
	);
}

export function pauseMidSlide(page: Page, { pane }: { pane: string }) {
	return page.evaluate(async (selector) => {
		const nextFrame = () => new Promise(requestAnimationFrame);
		const offset = () =>
			document.querySelector(selector)?.getBoundingClientRect().x ?? 0;
		while (offset() < innerWidth * 0.2) await nextFrame();
		for (const animation of document.getAnimations()) animation.pause();
		return offset();
	}, pane);
}

export const resumeSlides = (page: Page) =>
	page.evaluate(() => {
		for (const animation of document.getAnimations()) animation.play();
	});
