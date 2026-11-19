import type { Locator, Page } from "@playwright/test";

import { type FocusStop, measureFocusedElement } from "./focus-measure";

export { type FocusStop, measureFocusedElement } from "./focus-measure";

const MIN_CONTRAST = 3;

type FocusWalk = {
	key: string;
	stops: number;
	from: "documentStart" | "currentFocus";
	whenLost: "skip" | "end" | "report";
	onStop?: () => Promise<void>;
};

const FOCUS_ON_BODY: FocusStop = {
	element: "body",
	indicator: null,
	contrast: null,
	clippedBy: [],
	cornerClippedBy: [],
	paintedOverBy: null,
	coveredBy: null,
};

export async function walkFocus(
	page: Page,
	{ key, stops, from, whenLost, onStop }: FocusWalk,
): Promise<FocusStop[]> {
	if (from === "documentStart")
		await page.evaluate(() =>
			(document.activeElement as HTMLElement | null)?.blur(),
		);
	const visited: FocusStop[] = [];
	const seen = new Set<number>();
	for (let i = 0; i < stops; i++) {
		if (from === "documentStart" || i > 0) await page.keyboard.press(key);
		const measured = await page.evaluate(measureFocusedElement);
		if (!measured && whenLost === "skip") continue;
		if (!measured)
			return whenLost === "report"
				? [...visited, FOCUS_ON_BODY]
				: visited;
		if (seen.has(measured.key)) break;
		seen.add(measured.key);
		visited.push(measured.stop);
		await onStop?.();
	}
	return visited;
}

export async function tabThrough(
	page: Page,
	{
		stops,
		key = "Tab",
		fromCurrentFocus = false,
	}: { stops: number; key?: string; fromCurrentFocus?: boolean },
): Promise<FocusStop[]> {
	return walkFocus(page, {
		key,
		stops,
		from: fromCurrentFocus ? "currentFocus" : "documentStart",
		whenLost: "skip",
	});
}

export async function arrowThrough(
	page: Page,
	{ start, key, stops }: { start?: Locator; key: string; stops: number },
): Promise<FocusStop[]> {
	await start?.focus();
	return walkFocus(page, {
		key,
		stops,
		from: "currentFocus",
		whenLost: "report",
	});
}

export async function tabCycle(
	page: Page,
	{
		limit = 200,
		onStop,
	}: { limit?: number; onStop?: () => Promise<void> } = {},
): Promise<FocusStop[]> {
	return walkFocus(page, {
		key: "Tab",
		stops: limit,
		from: "documentStart",
		whenLost: "end",
		onStop,
	});
}

export function focusProblems(visited: FocusStop[]): string[] {
	return visited.flatMap(
		({
			element,
			indicator,
			contrast,
			clippedBy,
			cornerClippedBy,
			paintedOverBy,
			coveredBy,
		}) => [
			...(indicator ? [] : [`${element}: no focus indicator`]),
			...(contrast !== null && contrast < MIN_CONTRAST
				? [`${element}: focus indicator contrast ${contrast}:1`]
				: []),
			...clippedBy.map(
				(clipper) =>
					`${element}: focus indicator clipped by ${clipper}`,
			),
			...cornerClippedBy.map(
				(clipper) =>
					`${element}: focus indicator corner clipped by ${clipper}`,
			),
			...(paintedOverBy
				? [
						`${element}: focus indicator painted over by ${paintedOverBy}`,
					]
				: []),
			...(coveredBy ? [`${element}: covered by ${coveredBy}`] : []),
		],
	);
}

export async function focusedProblems(page: Page): Promise<string[]> {
	const measured = await page.evaluate(measureFocusedElement);
	return measured ? focusProblems([measured.stop]) : ["body: no focus"];
}
