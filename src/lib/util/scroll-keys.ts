import { preferredScrollBehavior } from "#lib/util/reduced-motion.ts";
import { typesText } from "#lib/util/text-entry.ts";

type ScrollEdge = "up" | "down" | "left" | "right";

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

function keyStep({ key, span }: { key: string; span: number }): number {
	if (key === "Home" || key === "End") return Number.POSITIVE_INFINITY;
	if (key === "PageUp" || key === "PageDown") return span * PAGE_STEP_SHARE;
	return LINE_STEP_PX;
}

export function scrollTowardEdge({
	event,
	edge,
	scroller,
}: {
	event: KeyboardEvent;
	edge: ScrollEdge;
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
		Math.max(least, position + toward * keyStep({ key: event.key, span })),
	);
	if (Math.abs(target - position) < 1) return;
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
