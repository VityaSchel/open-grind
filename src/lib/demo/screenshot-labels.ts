import type { KeyBox } from "./screenshot-scan";

export type OverlayKind = "toast" | "dialog" | "menu" | "sheet" | "popover";

export type LabelSource = "attribute" | "name" | "value" | "option";

export type ClipContext = {
	overflowX: string;
	overflowY: string;
	ellipsis: boolean;
	lineClamp: boolean;
	scrollWidth: number;
	clientWidth: number;
	scrollHeight: number;
	clientHeight: number;
	paddingBox: KeyBox;
};

export const OVERLAY_KINDS: readonly { selector: string; kind: OverlayKind }[] =
	[
		{ selector: "[data-sonner-toast]", kind: "toast" },
		{ selector: '[role="dialog"][data-vaul-drawer]', kind: "sheet" },
		{ selector: '[role="menu"]', kind: "menu" },
		{ selector: '[role="listbox"]', kind: "menu" },
		{ selector: "dialog[open]", kind: "dialog" },
		{ selector: '[role="dialog"]', kind: "dialog" },
		{ selector: '[role="alertdialog"]', kind: "dialog" },
		{ selector: '[role="tooltip"]', kind: "popover" },
		{ selector: ":popover-open", kind: "popover" },
	];

export const OVERLAY_SELECTOR = OVERLAY_KINDS.map(
	({ selector }) => selector,
).join(", ");

const BUTTON = [
	"button",
	'[role="button"]',
	'input[type="button" i]',
	'input[type="submit" i]',
	'input[type="reset" i]',
].join(", ");
const NAMING_SOURCES = new Set<LabelSource>(["name", "value"]);
const CLIPPING = new Set(["hidden", "clip"]);
const NO_CLAMP = new Set(["", "none"]);
const TOLERANCE_PX = 1;

export function overlayKind(
	matches: (selector: string) => boolean,
): OverlayKind | undefined {
	return OVERLAY_KINDS.find(({ selector }) => matches(selector))?.kind;
}

export function overlayOf(element: Element): OverlayKind | undefined {
	const overlay = element.closest(OVERLAY_SELECTOR);
	if (overlay === null) return undefined;
	return overlayKind((selector) => overlay.matches(selector));
}

export function buttonHolding(element: Element): Element | null {
	return element.closest(BUTTON);
}

export function buttonNamedBy({
	element,
	source,
}: {
	element: Element;
	source: LabelSource;
}): Element | null {
	return NAMING_SOURCES.has(source) && element.matches(BUTTON)
		? element
		: null;
}

function sharesLine({
	line,
	rect,
}: {
	line: { top: number; bottom: number };
	rect: KeyBox;
}): boolean {
	const overlap =
		Math.min(line.bottom, rect.y + rect.height) -
		Math.max(line.top, rect.y);
	return overlap > Math.min(line.bottom - line.top, rect.height) / 2;
}

export function countLines(rects: Iterable<KeyBox>): number {
	const lines: { top: number; bottom: number }[] = [];
	const drawn = [...rects]
		.filter(({ width }) => width > 0)
		.sort((a, b) => a.y - b.y);
	for (const rect of drawn) {
		const bottom = rect.y + rect.height;
		const line = lines.find((candidate) =>
			sharesLine({ line: candidate, rect }),
		);
		if (line === undefined) {
			lines.push({ top: rect.y, bottom });
		} else {
			line.top = Math.min(line.top, rect.y);
			line.bottom = Math.max(line.bottom, bottom);
		}
	}
	return lines.length;
}

function overflowsBox({
	rect,
	box,
	overflowX,
	overflowY,
}: {
	rect: KeyBox;
	box: KeyBox;
	overflowX: string;
	overflowY: string;
}): boolean {
	const pastX =
		rect.x < box.x - TOLERANCE_PX ||
		rect.x + rect.width > box.x + box.width + TOLERANCE_PX;
	const pastY =
		rect.y < box.y - TOLERANCE_PX ||
		rect.y + rect.height > box.y + box.height + TOLERANCE_PX;
	return (
		(CLIPPING.has(overflowX) && pastX) || (CLIPPING.has(overflowY) && pastY)
	);
}

function lineBox({
	rect,
	lineHeight,
}: {
	rect: KeyBox;
	lineHeight: number;
}): KeyBox {
	if (Number.isNaN(lineHeight) || rect.height <= lineHeight) return rect;
	return {
		...rect,
		y: rect.y + (rect.height - lineHeight) / 2,
		height: lineHeight,
	};
}

export function cutsText({
	context,
	rects,
	lineHeight,
}: {
	context: ClipContext;
	rects: Iterable<KeyBox>;
	lineHeight: number;
}): boolean {
	const { overflowX, overflowY, paddingBox } = context;
	if (
		context.ellipsis &&
		context.scrollWidth > context.clientWidth + TOLERANCE_PX
	) {
		return true;
	}
	if (
		context.lineClamp &&
		context.scrollHeight > context.clientHeight + TOLERANCE_PX
	) {
		return true;
	}
	return [...rects].some(
		(rect) =>
			rect.width > 0 &&
			overflowsBox({
				rect: lineBox({ rect, lineHeight }),
				box: paddingBox,
				overflowX,
				overflowY,
			}),
	);
}

function clampsLines(style: CSSStyleDeclaration): boolean {
	return (
		!NO_CLAMP.has(style.getPropertyValue("-webkit-line-clamp")) ||
		!NO_CLAMP.has(style.getPropertyValue("line-clamp"))
	);
}

function paddingBoxOf({
	element,
	style,
}: {
	element: Element;
	style: CSSStyleDeclaration;
}): KeyBox {
	const { x, y, width, height } = element.getBoundingClientRect();
	const left = parseFloat(style.borderLeftWidth) || 0;
	const right = parseFloat(style.borderRightWidth) || 0;
	const top = parseFloat(style.borderTopWidth) || 0;
	const bottom = parseFloat(style.borderBottomWidth) || 0;
	return {
		x: x + left,
		y: y + top,
		width: width - left - right,
		height: height - top - bottom,
	};
}

export function clipContextOf(element: Element): ClipContext | null {
	for (
		let current: Element | null = element;
		current;
		current = current.parentElement
	) {
		const style = getComputedStyle(current);
		if (style.display === "contents") continue;
		const { overflowX, overflowY } = style;
		if (overflowX === "visible" && overflowY === "visible") continue;
		return {
			overflowX,
			overflowY,
			ellipsis: style.textOverflow === "ellipsis",
			lineClamp: clampsLines(style),
			scrollWidth: current.scrollWidth,
			clientWidth: current.clientWidth,
			scrollHeight: current.scrollHeight,
			clientHeight: current.clientHeight,
			paddingBox: paddingBoxOf({ element: current, style }),
		};
	}
	return null;
}

export function clipsText({
	element,
	rects,
}: {
	element: Element;
	rects: Iterable<KeyBox>;
}): boolean {
	const context = clipContextOf(element);
	if (context === null) return false;
	const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
	return cutsText({ context, rects, lineHeight });
}
