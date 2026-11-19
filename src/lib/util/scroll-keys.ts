import { preferredScrollBehavior } from "#lib/util/reduced-motion.ts";
import { typesText } from "#lib/util/text-entry.ts";

type ScrollEdge = "up" | "down" | "left" | "right";
export type ScrollStep = "line" | "page" | "end";

const LINE_STEP_PX = 40;
const PAGE_STEP_SHARE = 0.875;

export const scrollKeysToward: Record<"top" | "bottom", ReadonlySet<string>> = {
	top: new Set(["ArrowUp", "PageUp", "Home"]),
	bottom: new Set(["ArrowDown", "PageDown", "End"]),
};

export const scrollKeys: ReadonlySet<string> = new Set([
	...scrollKeysToward.top,
	...scrollKeysToward.bottom,
	" ",
]);

export function keyScrollsToward({
	event,
	edge,
}: {
	event: KeyboardEvent;
	edge: "top" | "bottom";
}): boolean {
	if (event.key === " ") return event.shiftKey === (edge === "top");
	return scrollKeysToward[edge].has(event.key);
}

export function consumesScrollKeys(target: EventTarget | null): boolean {
	return typesText(target) || target instanceof HTMLSelectElement;
}

function stepLength({
	step,
	span,
}: {
	step: ScrollStep;
	span: number;
}): number {
	switch (step) {
		case "line":
			return LINE_STEP_PX;
		case "page":
			return span * PAGE_STEP_SHARE;
		case "end":
			return Number.POSITIVE_INFINITY;
	}
}

export function scrollTowardEdge({
	event,
	edge,
	step,
	scroller,
}: {
	event: KeyboardEvent;
	edge: ScrollEdge;
	step: ScrollStep;
	scroller: Element | null;
}): void {
	scroller ??= document.documentElement;
	const vertical = edge === "up" || edge === "down";
	const toward = edge === "down" || edge === "right" ? 1 : -1;
	const position = vertical ? scroller.scrollTop : scroller.scrollLeft;
	const span = vertical ? scroller.clientHeight : scroller.clientWidth;
	const extent =
		(vertical ? scroller.scrollHeight : scroller.scrollWidth) - span;
	const rtl = !vertical && getComputedStyle(scroller).direction === "rtl";
	const [least, most] = rtl ? [-extent, 0] : [0, extent];
	const target = Math.min(
		most,
		Math.max(least, position + toward * stepLength({ step, span })),
	);
	if (Math.abs(target - position) < 1) {
		const sidewaysKey =
			event.key === "ArrowLeft" || event.key === "ArrowRight";
		if (!vertical && !sidewaysKey) event.preventDefault();
		return;
	}
	event.preventDefault();
	scroller.scrollTo({
		[vertical ? "top" : "left"]: target,
		behavior: preferredScrollBehavior(),
	});
}

export function stopScrollAnimation(scroller: Element): void {
	scroller.scrollTo({
		top: scroller.scrollTop,
		left: scroller.scrollLeft,
		behavior: "instant",
	});
}
