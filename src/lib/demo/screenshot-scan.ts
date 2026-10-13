import { decodeMarkers, MarkerReader, type MarkerSpan } from "../i18n/markers";

export type KeyBox = { x: number; y: number; width: number; height: number };

export type KeySource = "text" | "attribute";

export type ShownKey = {
	key: string;
	box: KeyBox;
	via: KeySource;
	top: boolean;
};

export type ScannedKey = ShownKey & { boxes: KeyBox[] };

export type ViewScan = {
	keys: ScannedKey[];
	unmarked: string[];
	emoji: string[];
};

export const OVERLAY_SELECTOR = [
	"dialog[open]",
	":popover-open",
	'[role="dialog"]',
	'[role="alertdialog"]',
	'[role="menu"]',
	'[role="listbox"]',
	'[role="tooltip"]',
	"[data-sonner-toast]",
].join(", ");

const LABEL_ATTRIBUTES = [
	"aria-label",
	"aria-description",
	"aria-roledescription",
	"aria-valuetext",
	"aria-placeholder",
	"title",
	"alt",
];
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
const UNREAD_TEXT_PARENTS = new Set([
	"script",
	"style",
	"noscript",
	"template",
	"title",
	"textarea",
	"option",
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

type Placement = {
	host: Element;
	via: KeySource;
	top: boolean;
	untranslated: boolean;
};

type Found = Map<string, ScannedKey>;

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
		top: parent.closest(OVERLAY_SELECTOR) !== null,
		untranslated: untranslated(parent),
	};
}

function rank({ via, top }: ShownKey): number {
	return (top ? 2 : 0) + (via === "text" ? 1 : 0);
}

function record({ found, shown }: { found: Found; shown: ScannedKey }): void {
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
		top: earlier.top || shown.top,
	});
}

function normalized(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function scanText({
	found,
	unmarked,
	emoji,
}: {
	found: Found;
	unmarked: string[];
	emoji: string[];
}): void {
	const reader = new MarkerReader();
	const scopes = new Map<MarkerSpan, Element>();
	const shown = new Map<MarkerSpan, ShownKey>();
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
		const { host, via, top, untranslated } = placement;
		for (const { text, offset, spans } of runs) {
			if (normalized(text) === "") continue;
			range.setStart(node, offset);
			range.setEnd(node, offset + text.length);
			const rects =
				via === "text"
					? range.getClientRects()
					: [host.getBoundingClientRect()];
			const box = visibleBox({ rects, element: host });
			if (box === null) continue;
			if (via === "text" && EMOJI.test(text)) {
				emoji.push(normalized(text));
			}
			if (untranslated) continue;
			if (spans.length === 0 && via === "text") {
				unmarked.push(normalized(text));
			}
			for (const span of spans) {
				const earlier = shown.get(span);
				shown.set(span, {
					key: span.key,
					box: union(earlier?.box ?? null, box),
					via: earlier?.via === "text" ? "text" : via,
					top: earlier?.top === true || top,
				});
			}
		}
	}
	for (const key of shown.values()) {
		record({ found, shown: { ...key, boxes: [key.box] } });
	}
}

type LabelValue = { value: string; via: KeySource };

function labelValues(element: Element): LabelValue[] {
	const values = LABEL_ATTRIBUTES.flatMap((name): LabelValue[] => {
		const value = element.getAttribute(name);
		return value ? [{ value, via: "attribute" }] : [];
	});
	if (
		element instanceof HTMLTextAreaElement ||
		(element instanceof HTMLInputElement &&
			TEXT_INPUT_TYPES.has(element.type))
	) {
		const value = element.value || element.placeholder;
		if (value) values.push({ value, via: "text" });
	}
	if (element instanceof HTMLSelectElement) {
		for (const option of element.options) {
			values.push({
				value: option.text,
				via: option.selected ? "text" : "attribute",
			});
		}
	}
	return values;
}

function scanAttributes({
	found,
	emoji,
}: {
	found: Found;
	emoji: string[];
}): void {
	for (const element of document.body.querySelectorAll("*")) {
		const values = labelValues(element);
		const shownEmoji = values.filter(
			({ value, via }) => via === "text" && EMOJI.test(value),
		);
		const spans = values.flatMap(({ value, via }) =>
			decodeMarkers(value).map(({ key }) => ({ key, via })),
		);
		if (spans.length === 0 && shownEmoji.length === 0) continue;
		const host = boxedAncestor(element);
		if (!host?.checkVisibility(VISIBILITY)) continue;
		const area = renderedArea(host);
		const box = visibleBox({ rects: [area], element: host, area });
		if (box === null) continue;
		emoji.push(...shownEmoji.map(({ value }) => normalized(value)));
		if (untranslated(element)) continue;
		const top = element.closest(OVERLAY_SELECTOR) !== null;
		for (const { key, via } of spans) {
			record({ found, shown: { key, box, boxes: [box], via, top } });
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

function withHitTestableElements<T>(scan: () => T): T {
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(HIT_TESTABLE);
	document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
	try {
		return scan();
	} finally {
		document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
			(adopted) => adopted !== sheet,
		);
	}
}

function withAnimationsAsScreenshotted<T>(scan: () => T): T {
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
		return scan();
	} finally {
		for (const animation of infinite) animation.play();
	}
}

export function scanView(): ViewScan {
	return withAnimationsAsScreenshotted(() =>
		withHitTestableElements(() => {
			const found: Found = new Map();
			const unmarked: string[] = [];
			const emoji: string[] = [];
			scanText({ found, unmarked, emoji });
			scanAttributes({ found, emoji });
			return {
				keys: [...found.values()]
					.sort((a, b) => (a.key < b.key ? -1 : 1))
					.map((shown) => ({
						...shown,
						box: inPixels(shown.box),
						boxes: shown.boxes.map(inPixels),
					})),
				unmarked: [...new Set(unmarked)],
				emoji: [...new Set(emoji)],
			};
		}),
	);
}
