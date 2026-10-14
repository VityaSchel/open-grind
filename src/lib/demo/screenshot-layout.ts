import { stripMarkers } from "../i18n/markers";
import type { KeyBox } from "./screenshot-scan";

export type RenderedElement = { name: string; box: KeyBox };

export const UNREAD_TEXT_PARENTS = new Set([
	"script",
	"style",
	"noscript",
	"template",
	"title",
	"textarea",
	"option",
]);

const TOLERANCE_PX = 1;
const OFFSCREEN_LAID_OUT =
	"[data-offscreen-skip] { content-visibility: visible !important; }";

let sourceLayout: RenderedElement[] | null = null;
let matchedElements: WeakSet<Element> | null = null;

export function withAnimationsAsScreenshotted<T>(read: () => T): T {
	const infinite: Animation[] = [];
	for (const animation of document.getAnimations()) {
		if (animation.effect === null || animation.playbackRate === 0) continue;
		if (Number.isFinite(animation.effect.getComputedTiming().endTime)) {
			animation.finish();
		} else {
			animation.cancel();
			infinite.push(animation);
		}
	}
	try {
		return read();
	} finally {
		for (const animation of infinite) animation.play();
	}
}

export function withStyleSheet<T>({
	css,
	read,
}: {
	css: string;
	read: () => T;
}): T {
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(css);
	document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
	try {
		return read();
	} finally {
		document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
			(adopted) => adopted !== sheet,
		);
	}
}

function textBearingElements(): Element[] {
	const elements = new Set<Element>();
	const walker = document.createTreeWalker(
		document.body,
		NodeFilter.SHOW_TEXT,
	);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const parent = node.parentElement;
		if (parent === null || UNREAD_TEXT_PARENTS.has(parent.localName)) {
			continue;
		}
		if (stripMarkers(node.textContent ?? "").trim() !== "") {
			elements.add(parent);
		}
	}
	return [...elements];
}

function render(elements: Element[]): RenderedElement[] {
	return withAnimationsAsScreenshotted(() =>
		withStyleSheet({
			css: OFFSCREEN_LAID_OUT,
			read: () =>
				elements.map((element) => {
					const { x, y, width, height } =
						element.getBoundingClientRect();
					return {
						name: element.localName,
						box: { x, y, width, height },
					};
				}),
		}),
	);
}

function near(a: number, b: number): boolean {
	return Math.abs(a - b) <= TOLERANCE_PX;
}

function sameBox(a: KeyBox, b: KeyBox): boolean {
	return (
		near(a.x, b.x) &&
		near(a.y, b.y) &&
		near(a.width, b.width) &&
		near(a.height, b.height)
	);
}

export function sameLayout({
	source,
	marked,
}: {
	source: RenderedElement[];
	marked: RenderedElement[];
}): boolean {
	return (
		source.length === marked.length &&
		source.every((element, index) => {
			const other = marked[index];
			return (
				other !== undefined &&
				other.name === element.name &&
				sameBox(element.box, other.box)
			);
		})
	);
}

export function recordSourceLayout(): void {
	sourceLayout = render(textBearingElements());
	matchedElements = null;
}

export function matchSourceLayout(): boolean {
	const source = sourceLayout;
	sourceLayout = null;
	matchedElements = null;
	if (source === null) return false;
	const elements = textBearingElements();
	const marked = render(elements);
	if (!sameLayout({ source, marked })) return false;
	matchedElements = new WeakSet(elements);
	return true;
}

export function laidOutAsSource(): boolean {
	const matched = matchedElements;
	return (
		matched !== null &&
		textBearingElements().every((element) => matched.has(element))
	);
}
