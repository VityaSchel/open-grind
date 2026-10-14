import { decodeMarkers, MarkerReader, type MarkerSpan } from "../i18n/markers";
import {
	buttonHolding,
	buttonNamedBy,
	clipsText,
	countLines,
	type LabelSource,
	type OverlayKind,
	overlayOf,
} from "./screenshot-labels";
import {
	laidOutAsSource,
	UNREAD_TEXT_PARENTS,
	withAnimationsAsScreenshotted,
	withStyleSheet,
} from "./screenshot-layout";

export type KeyBox = { x: number; y: number; width: number; height: number };

export type KeySource = "text" | "attribute";

export type ShownKey = {
	key: string;
	box: KeyBox;
	via: KeySource;
	top: boolean;
	button?: true;
	overlay?: OverlayKind;
	wraps?: true;
	clipped?: true;
};

export type ScannedKey = ShownKey & { boxes: KeyBox[] };

export type ViewScan = {
	keys: ScannedKey[];
	unmarked: string[];
	emoji: string[];
	measured: boolean;
	compositeButtons: string[][];
};

const LABEL_ATTRIBUTES = [
	"aria-label",
	"aria-description",
	"aria-roledescription",
	"aria-valuetext",
	"aria-placeholder",
	"title",
	"alt",
];
const NAMING_ATTRIBUTES = new Set(["aria-label", "title"]);
const TEXT_INPUT_TYPES = new Set([
	"text",
	"search",
	"email",
	"url",
	"tel",
	"button",
	"submit",
	"reset",
]);
const REPLACED_ELEMENTS = new Set([
	"img",
	"video",
	"canvas",
	"iframe",
	"object",
	"embed",
]);
const TRANSLATION_MODE =
	'[translate=""], [translate="yes" i], [translate="no" i]';
const HIT_TESTABLE =
	"*, ::before, ::after { pointer-events: auto !important; }";
const COVERING_ALPHA = 0.5;
const CLIPPED_AWAY = "inset(50%)";
const PROBES = [0.5, 0.25, 0.75];
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u;
const VISIBILITY: CheckVisibilityOptions = {
	opacityProperty: true,
	visibilityProperty: true,
	contentVisibilityAuto: true,
};
const COMPOSITE_KEYS = 3;

type Placement = {
	host: Element;
	via: KeySource;
	overlay: OverlayKind | undefined;
	button: Element | null;
	untranslated: boolean;
};

type Occurrence = {
	key: string;
	box: KeyBox;
	boxes: KeyBox[];
	via: KeySource;
	overlay: OverlayKind | undefined;
	button: boolean;
	wraps: boolean;
	clipped: boolean;
};

type SpanOccurrence = Omit<Occurrence, "boxes" | "button" | "wraps"> & {
	button: Element | null;
	textRects: KeyBox[];
};

type Scan = {
	found: Map<string, Occurrence>;
	held: Map<Element, Set<string>>;
	unmarked: string[];
	emoji: string[];
	measured: boolean;
};

function untranslated(element: Element): boolean {
	const mode = element.closest(TRANSLATION_MODE)?.getAttribute("translate");
	return mode?.toLowerCase() === "no";
}

function alphaOf(color: string): number {
	const slashed = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color);
	if (slashed) return Number(slashed[1]) / (slashed[2] === "%" ? 100 : 1);
	const legacy = /^rgba\((?:[^,]*,){3}\s*([\d.]+)\)$/.exec(color);
	if (legacy) return Number(legacy[1]);
	return color === "transparent" ? 0 : 1;
}

function covers(element: Element): boolean {
	if (!element.checkVisibility(VISIBILITY)) return false;
	if (element instanceof SVGGraphicsElement) {
		return !(element instanceof SVGSVGElement);
	}
	if (REPLACED_ELEMENTS.has(element.localName)) return true;
	const style = getComputedStyle(element);
	return (
		style.backgroundImage !== "none" ||
		style.backdropFilter !== "none" ||
		alphaOf(style.backgroundColor) >= COVERING_ALPHA
	);
}

function reaches({
	element,
	x,
	y,
}: {
	element: Element;
	x: number;
	y: number;
}): boolean {
	for (const hit of document.elementsFromPoint(x, y)) {
		if (element.contains(hit)) return true;
		if (covers(hit)) return false;
	}
	return false;
}

function intersect(a: KeyBox, b: KeyBox): KeyBox | null {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const width = Math.min(a.x + a.width, b.x + b.width) - x;
	const height = Math.min(a.y + a.height, b.y + b.height) - y;
	return width > 0 && height > 0 ? { x, y, width, height } : null;
}

function union(a: KeyBox | null, b: KeyBox): KeyBox {
	if (a === null) return b;
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	return {
		x,
		y,
		width: Math.max(a.x + a.width, b.x + b.width) - x,
		height: Math.max(a.y + a.height, b.y + b.height) - y,
	};
}

function visibleBox({
	rects,
	element,
	area = element.getBoundingClientRect(),
}: {
	rects: Iterable<KeyBox>;
	element: Element;
	area?: KeyBox;
}): KeyBox | null {
	const viewport = { x: 0, y: 0, width: innerWidth, height: innerHeight };
	const bounds = intersect(area, viewport);
	if (bounds === null) return null;
	let box: KeyBox | null = null;
	for (const rect of rects) {
		const part = intersect(rect, bounds);
		if (part === null) continue;
		const y = part.y + part.height / 2;
		const hit = PROBES.some((share) =>
			reaches({ element, x: part.x + part.width * share, y }),
		);
		if (hit) box = union(box, part);
	}
	return box;
}

function hasArea({ width, height }: KeyBox): boolean {
	return width > 0 && height > 0;
}

function renderedArea(element: Element): KeyBox {
	const own = element.getBoundingClientRect();
	if (hasArea(own)) return own;
	const content = [...element.querySelectorAll("*")]
		.map((descendant) => descendant.getBoundingClientRect())
		.filter(hasArea)
		.reduce<KeyBox | null>((area, part) => union(area, part), null);
	return content ?? own;
}

function boxedAncestor(element: Element): Element | null {
	let current: Element | null = element;
	while (current && getComputedStyle(current).display === "contents") {
		current = current.parentElement;
	}
	return current;
}

function clipsToNothing(element: Element): boolean {
	const { overflowX, clipPath } = getComputedStyle(element);
	if (overflowX !== "hidden" && overflowX !== "clip") return false;
	if (clipPath === CLIPPED_AWAY) return true;
	const { width, height } = element.getBoundingClientRect();
	return width <= 1 && height <= 1;
}

function screenReaderHost(element: Element): Element | null {
	let hidden: Element | null = null;
	for (let current: Element | null = element; current; ) {
		if (clipsToNothing(current)) hidden = current;
		current = current.parentElement;
	}
	let host = hidden?.parentElement ?? null;
	while (host && clipsToNothing(host)) host = host.parentElement;
	return host === null ? null : boxedAncestor(host);
}

function placeText(parent: Element): Placement | null {
	const boxed = boxedAncestor(parent);
	if (!boxed?.checkVisibility(VISIBILITY)) return null;
	const labelHost = screenReaderHost(boxed);
	if (labelHost && !labelHost.checkVisibility(VISIBILITY)) return null;
	return {
		host: labelHost ?? boxed,
		via: labelHost ? "attribute" : "text",
		overlay: overlayOf(parent),
		button: buttonHolding(parent),
		untranslated: untranslated(parent),
	};
}

function rank({ via, overlay }: Occurrence): number {
	return (overlay === undefined ? 0 : 2) + (via === "text" ? 1 : 0);
}

function record({
	scan: { found, held },
	shown,
	button,
}: {
	scan: Scan;
	shown: Occurrence;
	button: Element | null;
}): void {
	if (button !== null) {
		const keys = held.get(button) ?? new Set<string>();
		keys.add(shown.key);
		held.set(button, keys);
	}
	const earlier = found.get(shown.key);
	if (earlier === undefined) {
		found.set(shown.key, shown);
		return;
	}
	const best = rank(shown) > rank(earlier) ? shown : earlier;
	found.set(shown.key, {
		key: shown.key,
		box: best.box,
		boxes: [...earlier.boxes, ...shown.boxes],
		via: earlier.via === "text" ? "text" : shown.via,
		overlay: best.overlay,
		button: earlier.button || shown.button,
		wraps: earlier.wraps || shown.wraps,
		clipped: earlier.clipped || shown.clipped,
	});
}

function normalized(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function spanOccurrence({
	earlier,
	key,
	box,
	rects,
	placement: { via, overlay, button },
	cut,
}: {
	earlier: SpanOccurrence | undefined;
	key: string;
	box: KeyBox;
	rects: KeyBox[];
	placement: Placement;
	cut: boolean;
}): SpanOccurrence {
	const textRects = earlier?.textRects ?? [];
	return {
		key,
		box: union(earlier?.box ?? null, box),
		via: earlier?.via === "text" ? "text" : via,
		overlay: earlier?.overlay ?? overlay,
		button: earlier?.button ?? button,
		textRects: via === "text" ? [...textRects, ...rects] : textRects,
		clipped: earlier?.clipped === true || cut,
	};
}

function recordSpans({
	scan,
	shown,
	untranslatedRects,
}: {
	scan: Scan;
	shown: Map<MarkerSpan, SpanOccurrence>;
	untranslatedRects: Map<MarkerSpan, KeyBox[]>;
}): void {
	for (const [span, { textRects, button, ...occurrence }] of shown) {
		const lines = countLines([
			...textRects,
			...(untranslatedRects.get(span) ?? []),
		]);
		record({
			scan,
			shown: {
				...occurrence,
				boxes: [occurrence.box],
				button: button !== null,
				wraps: scan.measured && lines > 1,
			},
			button,
		});
	}
}

function addRects({
	into,
	spans,
	rects,
}: {
	into: Map<MarkerSpan, KeyBox[]>;
	spans: readonly MarkerSpan[];
	rects: KeyBox[];
}): void {
	for (const span of spans) {
		into.set(span, [...(into.get(span) ?? []), ...rects]);
	}
}

function scanText(scan: Scan): void {
	const { unmarked, emoji, measured } = scan;
	const reader = new MarkerReader();
	const scopes = new Map<MarkerSpan, Element>();
	const shown = new Map<MarkerSpan, SpanOccurrence>();
	const untranslatedRects = new Map<MarkerSpan, KeyBox[]>();
	const range = document.createRange();
	const walker = document.createTreeWalker(
		document.body,
		NodeFilter.SHOW_TEXT,
	);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const parent = node.parentElement;
		if (!(node instanceof Text) || parent === null) continue;
		if (UNREAD_TEXT_PARENTS.has(parent.localName)) continue;
		reader.unwind((span) => scopes.get(span)?.contains(node) ?? false);
		const opened = reader.spans.length;
		const runs = reader.read(node.data);
		for (const span of reader.spans.slice(opened)) scopes.set(span, parent);
		const placement = placeText(parent);
		if (placement === null) continue;
		const { host, via, untranslated } = placement;
		for (const { text, offset, spans } of runs) {
			if (normalized(text) === "") continue;
			range.setStart(node, offset);
			range.setEnd(node, offset + text.length);
			const rects =
				via === "text"
					? [...range.getClientRects()]
					: [host.getBoundingClientRect()];
			const box = visibleBox({ rects, element: host });
			if (box === null) continue;
			if (via === "text" && EMOJI.test(text)) {
				emoji.push(normalized(text));
			}
			if (untranslated) {
				if (via === "text") {
					addRects({ into: untranslatedRects, spans, rects });
				}
				continue;
			}
			if (spans.length === 0 && via === "text") {
				unmarked.push(normalized(text));
			}
			if (spans.length === 0) continue;
			const cut =
				measured &&
				via === "text" &&
				clipsText({ element: parent, rects });
			for (const span of spans) {
				shown.set(
					span,
					spanOccurrence({
						earlier: shown.get(span),
						key: span.key,
						box,
						rects,
						placement,
						cut,
					}),
				);
			}
		}
	}
	recordSpans({ scan, shown, untranslatedRects });
}

type LabelValue = { value: string; via: KeySource; source: LabelSource };

function labelValues(element: Element): LabelValue[] {
	const values = LABEL_ATTRIBUTES.flatMap((name): LabelValue[] => {
		const value = element.getAttribute(name);
		const source = NAMING_ATTRIBUTES.has(name) ? "name" : "attribute";
		return value ? [{ value, via: "attribute", source }] : [];
	});
	if (
		element instanceof HTMLTextAreaElement ||
		(element instanceof HTMLInputElement &&
			TEXT_INPUT_TYPES.has(element.type))
	) {
		const value = element.value || element.placeholder;
		if (value) values.push({ value, via: "text", source: "value" });
	}
	if (element instanceof HTMLSelectElement) {
		for (const option of element.options) {
			values.push({
				value: option.text,
				via: option.selected ? "text" : "attribute",
				source: "option",
			});
		}
	}
	return values;
}

function scanAttributes(scan: Scan): void {
	for (const element of document.body.querySelectorAll("*")) {
		const values = labelValues(element);
		const shownEmoji = values.filter(
			({ value, via }) => via === "text" && EMOJI.test(value),
		);
		const spans = values.flatMap(({ value, via, source }) =>
			decodeMarkers(value).map(({ key }) => ({ key, via, source })),
		);
		if (spans.length === 0 && shownEmoji.length === 0) continue;
		const host = boxedAncestor(element);
		if (!host?.checkVisibility(VISIBILITY)) continue;
		const area = renderedArea(host);
		const box = visibleBox({ rects: [area], element: host, area });
		if (box === null) continue;
		scan.emoji.push(...shownEmoji.map(({ value }) => normalized(value)));
		if (untranslated(element)) continue;
		const overlay = overlayOf(element);
		for (const { key, via, source } of spans) {
			const button = buttonNamedBy({ element, source });
			record({
				scan,
				shown: {
					key,
					box,
					boxes: [box],
					via,
					overlay,
					button: button !== null,
					wraps: false,
					clipped: false,
				},
				button,
			});
		}
	}
}

function inPixels(box: KeyBox): KeyBox {
	const scale = devicePixelRatio;
	const x = Math.round(box.x * scale);
	const y = Math.round(box.y * scale);
	return {
		x,
		y,
		width: Math.round((box.x + box.width) * scale) - x,
		height: Math.round((box.y + box.height) * scale) - y,
	};
}

function scannedKey({
	key,
	box,
	boxes,
	via,
	overlay,
	button,
	wraps,
	clipped,
}: Occurrence): ScannedKey {
	return {
		key,
		box: inPixels(box),
		via,
		top: overlay !== undefined,
		...(button ? { button } : {}),
		...(overlay === undefined ? {} : { overlay }),
		...(wraps ? { wraps } : {}),
		...(clipped ? { clipped } : {}),
		boxes: boxes.map(inPixels),
	};
}

function compositeButtons(held: Map<Element, Set<string>>): string[][] {
	const lists = [...held.values()]
		.filter(({ size }) => size >= COMPOSITE_KEYS)
		.map((keys) => [...keys].sort().join("\n"));
	return [...new Set(lists)].sort().map((list) => list.split("\n"));
}

function scanShown(): ViewScan {
	const scan: Scan = {
		found: new Map(),
		held: new Map(),
		unmarked: [],
		emoji: [],
		measured: laidOutAsSource(),
	};
	scanText(scan);
	scanAttributes(scan);
	return {
		keys: [...scan.found.values()]
			.sort((a, b) => (a.key < b.key ? -1 : 1))
			.map(scannedKey),
		unmarked: [...new Set(scan.unmarked)],
		emoji: [...new Set(scan.emoji)],
		measured: scan.measured,
		compositeButtons: compositeButtons(scan.held),
	};
}

export function scanView(): ViewScan {
	return withAnimationsAsScreenshotted(() =>
		withStyleSheet({ css: HIT_TESTABLE, read: scanShown }),
	);
}
