import type { Page } from "@playwright/test";

export type FocusStop = {
	element: string;
	indicator: "outline" | "overlay" | "highlight" | "dialog" | null;
	contrast: number | null;
	clippedBy: string[];
	paintedOverBy: string | null;
	coveredBy: string | null;
};

const MIN_CONTRAST = 3;

export async function measureFocusedElement(): Promise<{
	key: number;
	stop: FocusStop;
} | null> {
	const store = window as unknown as {
		__focusKeys?: WeakMap<Element, number>;
		__focusKeyCount?: number;
	};
	store.__focusKeys ??= new WeakMap();
	store.__focusKeyCount ??= 0;
	const focused = () => {
		let node = document.activeElement;
		while (node?.shadowRoot?.activeElement)
			node = node.shadowRoot.activeElement;
		return node;
	};
	let element = focused();
	for (let settling = 0; element && settling < 5; settling++) {
		await Promise.all(
			element.getAnimations().map((a) => a.finished.catch(() => null)),
		);
		await new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(resolve)),
		);
		if (focused() === element) break;
		element = focused();
	}
	if (!element || element === document.body) return null;
	if (!store.__focusKeys.has(element))
		store.__focusKeys.set(element, ++store.__focusKeyCount);
	const key = store.__focusKeys.get(element)!;
	const style = getComputedStyle(element);

	const describe = (node: Element) => {
		const name =
			node.getAttribute("aria-label") ??
			(node as HTMLElement).innerText
				?.trim()
				.replace(/\s+/g, " ")
				.slice(0, 40);
		return [
			node.tagName.toLowerCase(),
			node.getAttribute("role"),
			node.getAttribute("data-slot"),
			name && `"${name}"`,
		]
			.filter(Boolean)
			.join(" ");
	};

	const canvas = new OffscreenCanvas(1, 1);
	const context = canvas.getContext("2d", { willReadFrequently: true })!;
	const rgba = (color: string) => {
		context.clearRect(0, 0, 1, 1);
		context.fillStyle = color;
		context.fillRect(0, 0, 1, 1);
		const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(
			0,
			0,
			1,
			1,
		).data;
		return { rgb: [r, g, b], alpha: a / 255 };
	};
	const blend = (
		top: { rgb: number[]; alpha: number },
		bottom: number[],
	): number[] =>
		top.rgb.map((c, i) => c * top.alpha + bottom[i]! * (1 - top.alpha));
	const luminance = (rgb: number[]) => {
		const [r = 0, g = 0, b = 0] = rgb.map((c) => {
			const s = c / 255;
			return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const contrastRatio = (a: number[], b: number[]) => {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (hi! + 0.05) / (lo! + 0.05);
	};
	const backdropOf = (start: Element | null) => {
		const layers: { rgb: number[]; alpha: number }[] = [];
		for (let node = start; node; node = node.parentElement) {
			const layer = rgba(getComputedStyle(node).backgroundColor);
			if (layer.alpha > 0) layers.push(layer);
			if (layer.alpha >= 1) break;
		}
		return layers.reduceRight<number[]>(
			(below, layer) => blend(layer, below),
			[255, 255, 255],
		);
	};
	const rounded = (ratio: number) => Math.round(ratio * 100) / 100;

	const outlineOf = (s: CSSStyleDeclaration) => {
		const width =
			s.outlineStyle === "none" ? 0 : parseFloat(s.outlineWidth);
		return width > 0
			? {
					width,
					offset: parseFloat(s.outlineOffset) || 0,
					color: s.outlineColor,
				}
			: null;
	};
	const spreadRingOf = (s: CSSStyleDeclaration) => {
		if (s.boxShadow === "none") return null;
		for (const shadow of s.boxShadow.split(/,(?![^(]*\))/)) {
			const color = /^\s*([a-z]+\([^)]*\)|#\w+)/.exec(shadow)?.[1];
			if (!color || rgba(color).alpha === 0) continue;
			const [, , blur = 0, spread = 0] =
				shadow
					.replace(/[a-z]+\([^)]*\)/g, "")
					.match(/-?[\d.]+px/g)
					?.map(parseFloat) ?? [];
			if (blur > 0 || spread <= 0) continue;
			const inset = shadow.includes("inset");
			return { width: spread, offset: inset ? -spread : 0, color };
		}
		return null;
	};

	const dialog = element.matches('[role="dialog"], [role="alertdialog"]');
	const overlay = outlineOf(getComputedStyle(element, "::after"));
	let ringOwner: Element = element;
	let ring =
		overlay ?? outlineOf(style) ?? (dialog ? null : spreadRingOf(style));
	for (
		let ancestor = element.parentElement, depth = 0;
		!ring && ancestor && depth < 3;
		ancestor = ancestor.parentElement, depth++
	) {
		ring = outlineOf(getComputedStyle(ancestor));
		if (ring) ringOwner = ancestor;
	}
	const role = element.getAttribute("role") ?? "";
	const highlight =
		!ring &&
		/^(menuitem|menuitemcheckbox|menuitemradio|option)$/.test(role) &&
		rgba(style.backgroundColor).alpha > 0
			? rounded(
					contrastRatio(
						backdropOf(element),
						backdropOf(element.parentElement),
					),
				)
			: null;

	const box = ringOwner.getBoundingClientRect();
	const ringInside = ring !== null && ring.offset + ring.width <= 0;
	const backdropAt = (x: number, y: number): number[] | null => {
		const layers: { rgb: number[]; alpha: number }[] = [];
		for (const node of document.elementsFromPoint(x, y)) {
			if (node === ringOwner || ringOwner.contains(node)) continue;
			if (node.matches("img, video, canvas, picture, image")) return null;
			const layer = rgba(getComputedStyle(node).backgroundColor);
			if (layer.alpha > 0) layers.push(layer);
			if (layer.alpha >= 1) break;
		}
		return layers.reduceRight<number[]>(
			(below, layer) => blend(layer, below),
			[255, 255, 255],
		);
	};
	const backdropsUnderRing = (): number[][] => {
		if (!ring || ringInside) return [backdropOf(ringOwner)];
		const middle = ring.offset + ring.width / 2;
		const centerX = (box.left + box.right) / 2;
		const centerY = (box.top + box.bottom) / 2;
		const onScreen = [
			[box.left - middle, centerY],
			[box.right + middle, centerY],
			[centerX, box.top - middle],
			[centerX, box.bottom + middle],
		].filter(
			([x = -1, y = -1]) =>
				x >= 0 && y >= 0 && x < innerWidth && y < innerHeight,
		);
		if (onScreen.length === 0) return [backdropOf(ringOwner.parentElement)];
		return onScreen
			.map(([x = 0, y = 0]) => backdropAt(x, y))
			.filter((backdrop): backdrop is number[] => backdrop !== null);
	};
	const median = (values: number[]) => {
		const sorted = values.toSorted((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)]!;
	};
	const ringContrasts = ring
		? backdropsUnderRing().map((backdrop) =>
				contrastRatio(blend(rgba(ring.color), backdrop), backdrop),
			)
		: [];
	const contrast =
		ringContrasts.length > 0
			? rounded(median(ringContrasts))
			: ring
				? null
				: highlight;

	const reach = ring ? Math.max(ring.offset + ring.width, 0) : 0;
	const outer = {
		left: box.left - reach,
		top: box.top - reach,
		right: box.right + reach,
		bottom: box.bottom + reach,
	};

	const establishesContainingBlock = (
		s: CSSStyleDeclaration,
		forFixed: boolean,
	) =>
		(!forFixed && s.position !== "static") ||
		s.transform !== "none" ||
		s.translate !== "none" ||
		s.scale !== "none" ||
		s.rotate !== "none" ||
		s.filter !== "none" ||
		s.backdropFilter !== "none" ||
		s.perspective !== "none" ||
		s.containerType !== "normal" ||
		/paint|layout|strict|content/.test(s.contain) ||
		/transform|filter/.test(s.willChange);

	const clippedBy: string[] = [];
	const overhang = (
		clip: { left: number; top: number; right: number; bottom: number },
		axes: { x: boolean; y: boolean },
	) =>
		[
			axes.x && clip.left - outer.left > 0.5 && "left",
			axes.y && clip.top - outer.top > 0.5 && "top",
			axes.x && outer.right - clip.right > 0.5 && "right",
			axes.y && outer.bottom - clip.bottom > 0.5 && "bottom",
		].filter(Boolean);

	if (ring) {
		const ownerPosition = getComputedStyle(ringOwner).position;
		let escaping: "absolute" | "fixed" | null =
			ownerPosition === "absolute" || ownerPosition === "fixed"
				? ownerPosition
				: null;
		for (
			let ancestor = ringOwner.parentElement;
			ancestor && ancestor !== document.documentElement;
			ancestor = ancestor.parentElement
		) {
			const s = getComputedStyle(ancestor);
			if (escaping) {
				if (!establishesContainingBlock(s, escaping === "fixed"))
					continue;
				escaping = null;
			}
			const axes = {
				x: s.overflowX !== "visible" || s.contain.includes("paint"),
				y: s.overflowY !== "visible" || s.contain.includes("paint"),
			};
			if (axes.x || axes.y) {
				const rect = ancestor.getBoundingClientRect();
				const left = rect.left + ancestor.clientLeft;
				const top = rect.top + ancestor.clientTop;
				const sides = overhang(
					{
						left,
						top,
						right: left + ancestor.clientWidth,
						bottom: top + ancestor.clientHeight,
					},
					axes,
				);
				if (sides.length)
					clippedBy.push(
						`${describe(ancestor)} (${sides.join(", ")})`,
					);
			}
			if (s.position === "absolute" || s.position === "fixed")
				escaping = s.position;
		}
		const viewportSides = overhang(
			{ left: 0, top: 0, right: innerWidth, bottom: innerHeight },
			{ x: true, y: true },
		);
		if (viewportSides.length)
			clippedBy.push(`viewport (${viewportSides.join(", ")})`);
	}

	const paintsOnTop = (node: Element) => {
		for (
			let n: Element | null = node;
			n && n !== ringOwner;
			n = n.parentElement
		) {
			const s = getComputedStyle(n);
			if (
				s.position !== "static" ||
				s.transform !== "none" ||
				parseFloat(s.opacity) < 1 ||
				s.willChange !== "auto"
			)
				return true;
		}
		return false;
	};
	let paintedOverBy: string | null = null;
	if (ring && !overlay) {
		const middle = ring.offset + ring.width / 2;
		const left = box.left - middle;
		const top = box.top - middle;
		const right = box.right + middle;
		const bottom = box.bottom + middle;
		const samples = [0.25, 0.5, 0.75].flatMap((f) => [
			[left + (right - left) * f, top],
			[left + (right - left) * f, bottom],
			[left, top + (bottom - top) * f],
			[right, top + (bottom - top) * f],
		]);
		const hits = samples
			.filter(
				([x = 0, y = 0]) =>
					x >= 0 && y >= 0 && x < innerWidth && y < innerHeight,
			)
			.map(([x = 0, y = 0]) => document.elementFromPoint(x, y))
			.filter(
				(hit): hit is Element =>
					hit !== null &&
					hit !== ringOwner &&
					ringOwner.contains(hit) &&
					paintsOnTop(hit),
			);
		if (hits.length * 2 >= samples.length)
			paintedOverBy = describe(hits[0]!);
	}

	const x = Math.min(Math.max((box.left + box.right) / 2, 1), innerWidth - 1);
	const y = Math.min(
		Math.max((box.top + box.bottom) / 2, 1),
		innerHeight - 1,
	);
	const hit = document.elementFromPoint(x, y);
	const coveredBy =
		hit &&
		!element.contains(hit) &&
		!hit.contains(element) &&
		!(hit instanceof HTMLLabelElement && hit.control === element)
			? describe(hit)
			: null;

	return {
		key,
		stop: {
			element: describe(element),
			indicator: overlay
				? "overlay"
				: ring
					? "outline"
					: highlight !== null
						? "highlight"
						: dialog
							? "dialog"
							: null,
			contrast,
			clippedBy,
			paintedOverBy,
			coveredBy,
		},
	};
}

export async function tabThrough(
	page: Page,
	{
		stops,
		key = "Tab",
		fromCurrentFocus = false,
	}: { stops: number; key?: string; fromCurrentFocus?: boolean },
): Promise<FocusStop[]> {
	if (!fromCurrentFocus)
		await page.evaluate(() =>
			(document.activeElement as HTMLElement | null)?.blur(),
		);
	const visited: FocusStop[] = [];
	const seen = new Set<number>();
	for (let i = 0; i < stops; i++) {
		if (!fromCurrentFocus || i > 0) await page.keyboard.press(key);
		const measured = await page.evaluate(measureFocusedElement);
		if (!measured) continue;
		if (seen.has(measured.key)) break;
		seen.add(measured.key);
		visited.push(measured.stop);
	}
	return visited;
}

export function focusProblems(visited: FocusStop[]): string[] {
	return visited.flatMap(
		({
			element,
			indicator,
			contrast,
			clippedBy,
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
			...(paintedOverBy
				? [
						`${element}: focus indicator painted over by ${paintedOverBy}`,
					]
				: []),
			...(coveredBy ? [`${element}: covered by ${coveredBy}`] : []),
		],
	);
}
