import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { TrustedTouch } from "./app";

export const BLUR_MODES = ["max", "medium", "min", "off"] as const;
export type BlurMode = (typeof BLUR_MODES)[number];

const SIDEWAYS_SCROLLER = '[data-scroll-intent="x"]';
const UNDER_BAR_MARK = "data-layout-guard-under";
const SCROLLED_MARK = "data-layout-guard-scrolled";
const SHOWS_THROUGH = 0.1;

const STRUCTURE_RULES = [
	"landmark-one-main",
	"landmark-no-duplicate-main",
	"landmark-unique",
	"landmark-main-is-top-level",
	"region",
	"heading-order",
	"empty-heading",
	"nested-interactive",
	"button-name",
	"link-name",
	"aria-command-name",
	"aria-input-field-name",
	"aria-toggle-field-name",
	"input-button-name",
	"label",
	"select-name",
	"aria-allowed-attr",
	"aria-required-attr",
	"aria-required-children",
	"aria-required-parent",
	"aria-valid-attr",
	"aria-valid-attr-value",
	"aria-hidden-focus",
	"duplicate-id-aria",
	"list",
	"listitem",
];

type Box = { x: number; y: number; width: number; height: number };

export type Bar = {
	name: string;
	edge: "top" | "bottom";
	box: Box;
	clearZone: number;
	underneath: { name: string; mark: string } | null;
};

export type LayoutScan = {
	documentOverflow: { x: number; y: number };
	bars: Bar[];
	scrollersInBars: string[];
	unintendedSidewaysScrollers: string[];
	escapes: string[];
};

function scanInPage({ sideways, mark }: { sideways: string; mark: string }) {
	const describe = (element: Element) => {
		const label = element.getAttribute("aria-label");
		const slot = element.getAttribute("data-slot");
		return [
			element.tagName.toLowerCase(),
			label ? `[aria-label="${label}"]` : "",
			slot ? `[data-slot="${slot}"]` : "",
			...[...element.classList].slice(0, 3).map((name) => `.${name}`),
		].join("");
	};
	const shown = (element: Element) =>
		element.getClientRects().length > 0 &&
		getComputedStyle(element).visibility !== "hidden" &&
		!element.closest("[inert], [data-leaving]");
	const scrollable = (value: string) =>
		value === "auto" || value === "scroll";
	const scrollsSideways = (element: Element) =>
		scrollable(getComputedStyle(element).overflowX) &&
		element.scrollWidth > element.clientWidth + 1;
	const scrollsVertically = (element: Element) =>
		scrollable(getComputedStyle(element).overflowY) &&
		element.scrollHeight > element.clientHeight + 1;

	const containsFixed = (style: CSSStyleDeclaration) =>
		style.transform !== "none" ||
		style.perspective !== "none" ||
		style.filter !== "none" ||
		style.backdropFilter !== "none" ||
		style.containerType !== "normal" ||
		/paint|layout|strict|content/.test(style.contain) ||
		/transform|perspective|filter/.test(style.willChange);
	const containingBlock = (element: Element): Element | null => {
		const { position } = getComputedStyle(element);
		if (position !== "fixed" && position !== "absolute")
			return element.parentElement;
		for (
			let ancestor = element.parentElement;
			ancestor;
			ancestor = ancestor.parentElement
		) {
			const style = getComputedStyle(ancestor);
			if (containsFixed(style)) return ancestor;
			if (position === "absolute" && style.position !== "static")
				return ancestor;
		}
		return null;
	};
	const visibleBox = (element: Element) => {
		const box = element.getBoundingClientRect();
		let { left, right, top, bottom } = box;
		for (
			let block = containingBlock(element);
			block &&
			block !== document.body &&
			block !== document.documentElement;
			block = containingBlock(block)
		) {
			const style = getComputedStyle(block);
			const paintContained = /paint|strict|content/.test(style.contain);
			const clip = block.getBoundingClientRect();
			if (paintContained || style.overflowX !== "visible") {
				left = Math.max(left, clip.left);
				right = Math.min(right, clip.right);
			}
			if (paintContained || style.overflowY !== "visible") {
				top = Math.max(top, clip.top);
				bottom = Math.min(bottom, clip.bottom);
			}
		}
		return { left, right, top, bottom };
	};

	const everything = [...document.body.querySelectorAll("*")].filter(shown);

	const barElements = everything.filter(
		(element): element is HTMLElement =>
			element instanceof HTMLElement &&
			element.dataset.screenChrome !== undefined,
	);
	const scrollersInBars = barElements.flatMap((bar) =>
		[bar, ...bar.querySelectorAll("*")]
			.filter(
				(element) =>
					shown(element) &&
					((scrollsSideways(element) && !element.matches(sideways)) ||
						scrollsVertically(element)),
			)
			.map((element) => `${describe(bar)} > ${describe(element)}`),
	);

	const unintendedSidewaysScrollers = everything
		.filter(
			(element) => scrollsSideways(element) && !element.matches(sideways),
		)
		.map(describe);

	const escapes = everything
		.filter(
			(element) =>
				!(element instanceof SVGElement && element.ownerSVGElement),
		)
		.flatMap((element) => {
			const { left, right, top, bottom } = visibleBox(element);
			if (right - left <= 1 || bottom - top <= 1) return [];
			const outside =
				left < -1 ||
				top < -1 ||
				right > innerWidth + 1 ||
				bottom > innerHeight + 1;
			if (!outside) return [];
			const rounded = [left, top, right, bottom].map(Math.round);
			return [`${describe(element)} spans ${rounded.join(",")}`];
		});

	const root = getComputedStyle(document.documentElement);
	const safeTop = parseFloat(root.getPropertyValue("--safe-area-top")) || 0;
	const safeBottom =
		parseFloat(root.getPropertyValue("--safe-area-bottom")) || 0;
	const pageScrollers = everything.filter(
		(element) =>
			scrollable(getComputedStyle(element).overflowY) &&
			element.clientHeight > innerHeight / 3,
	);
	document
		.querySelectorAll(`[${mark}]`)
		.forEach((element) => element.removeAttribute(mark));

	const bars = barElements.map((bar, index): Bar => {
		const box = bar.getBoundingClientRect();
		const zoneTop = Math.max(box.top, safeTop);
		const zoneBottom = Math.min(box.bottom, innerHeight - safeBottom);
		const underneath = pageScrollers
			.filter(
				(scroller) =>
					!bar.contains(scroller) && !scroller.contains(bar),
			)
			.filter((scroller) => {
				const span = scroller.getBoundingClientRect();
				return (
					span.left < box.right &&
					span.right > box.left &&
					span.top < zoneBottom &&
					span.bottom > zoneTop
				);
			})
			.sort((a, b) => b.clientHeight - a.clientHeight)[0];
		if (underneath && !underneath.hasAttribute(mark))
			underneath.setAttribute(mark, String(index));
		const left = Math.max(0, box.left);
		const top = Math.max(0, box.top);
		return {
			name: describe(bar),
			edge: bar.dataset.screenChrome === "bottom" ? "bottom" : "top",
			box: {
				x: left,
				y: top,
				width: Math.min(box.right, innerWidth) - left,
				height: Math.min(box.bottom, innerHeight) - top,
			},
			clearZone: Math.max(0, Math.round(zoneBottom - zoneTop)),
			underneath: underneath
				? {
						name: describe(underneath),
						mark: underneath.getAttribute(mark) ?? "",
					}
				: null,
		};
	});

	const scrolling = document.scrollingElement ?? document.documentElement;
	return {
		documentOverflow: {
			x: scrolling.scrollWidth - scrolling.clientWidth,
			y: scrolling.scrollHeight - scrolling.clientHeight,
		},
		bars,
		scrollersInBars,
		unintendedSidewaysScrollers,
		escapes,
	};
}

export function scanLayout(page: Page): Promise<LayoutScan> {
	return page.evaluate(scanInPage, {
		sideways: SIDEWAYS_SCROLLER,
		mark: UNDER_BAR_MARK,
	});
}

export function settle(page: Page): Promise<void> {
	return page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				let previous = "";
				let stableFrames = 0;
				const tick = () => {
					const layout =
						[
							...document.querySelectorAll(
								".pblur, [data-screen-chrome]",
							),
						]
							.map((element) =>
								JSON.stringify(element.getBoundingClientRect()),
							)
							.join() + document.body.scrollHeight;
					stableFrames = layout === previous ? stableFrames + 1 : 0;
					previous = layout;
					if (stableFrames >= 5) resolve();
					else requestAnimationFrame(tick);
				};
				tick();
			}),
	);
}

export function setBlurMode(page: Page, mode: BlurMode): Promise<void> {
	return page.evaluate(
		(value) =>
			document.documentElement.setAttribute("data-backdrop-blur", value),
		mode,
	);
}

async function paintUnderneath(
	page: Page,
	{ mark, filter }: { mark: string; filter: string | null },
) {
	await page.evaluate(
		({ selector, filter }) => {
			const scroller = document.querySelector<HTMLElement>(selector);
			if (!scroller) throw new Error(`nothing matches ${selector}`);
			if (filter === null) {
				scroller.style.removeProperty("background");
				scroller.style.removeProperty("filter");
				return undefined;
			}
			scroller.style.setProperty("background", "#808080", "important");
			scroller.style.setProperty("filter", filter, "important");
			return new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			);
		},
		{ selector: `[${UNDER_BAR_MARK}="${mark}"]`, filter },
	);
}

function rowsShowingThrough(
	page: Page,
	{ dark, light }: { dark: Buffer; light: Buffer },
): Promise<boolean[]> {
	return page.evaluate(
		async ({ dark, light, threshold }) => {
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
			const [black, white] = [await decode(dark), await decode(light)];
			const gap = (at: number) =>
				Math.abs((white.data[at] ?? 0) - (black.data[at] ?? 0)) / 255;
			const rows: boolean[] = [];
			for (let y = 0; y < black.height; y++) {
				let shows = false;
				for (let x = 0; x < black.width && !shows; x++) {
					const at = (y * black.width + x) * 4;
					shows =
						(gap(at) + gap(at + 1) + gap(at + 2)) / 3 >= threshold;
				}
				rows.push(shows);
			}
			return rows;
		},
		{
			dark: dark.toString("base64"),
			light: light.toString("base64"),
			threshold: SHOWS_THROUGH,
		},
	);
}

export async function seeThroughDepth(
	page: Page,
	{ bar }: { bar: Bar },
): Promise<number> {
	if (!bar.underneath) return 0;
	const { mark } = bar.underneath;
	await paintUnderneath(page, { mark, filter: "brightness(0)" });
	const dark = await page.screenshot({ clip: bar.box, caret: "hide" });
	await paintUnderneath(page, { mark, filter: "brightness(0) invert(1)" });
	const light = await page.screenshot({ clip: bar.box, caret: "hide" });
	await paintUnderneath(page, { mark, filter: null });
	const rows = await rowsShowingThrough(page, { dark, light });
	const fromContent = bar.edge === "bottom" ? rows : rows.toReversed();
	const firstOpaque = fromContent.indexOf(false);
	return firstOpaque === -1 ? fromContent.length : firstOpaque;
}

function scrollOffsets(page: Page) {
	return page.evaluate(
		({ sideways, key }) => {
			const offsets: Record<
				string,
				{ x: number; y: number; sideways: boolean }
			> = { document: { x: scrollX, y: scrollY, sideways: false } };
			for (const element of document.body.querySelectorAll("*")) {
				if (element.scrollLeft === 0 && element.scrollTop === 0)
					continue;
				if (!element.hasAttribute(key))
					element.setAttribute(
						key,
						String(document.querySelectorAll(`[${key}]`).length),
					);
				const classes = [...element.classList].slice(0, 3).join(".");
				const name = `${element.tagName.toLowerCase()}.${classes} #${element.getAttribute(key)}`;
				offsets[name] = {
					x: element.scrollLeft,
					y: element.scrollTop,
					sideways: element.matches(sideways),
				};
			}
			return offsets;
		},
		{ sideways: SIDEWAYS_SCROLLER, key: SCROLLED_MARK },
	);
}

export async function scrollsMovedByBarInput(
	page: Page,
	{ bar }: { bar: Bar },
): Promise<string[]> {
	const viewport = page.viewportSize() ?? { width: 0, height: 0 };
	const at = {
		x: bar.box.x + bar.box.width / 2,
		y: bar.box.y + bar.box.height / 2,
	};
	const touch = await TrustedTouch.attach(page);
	const gestures: { name: string; run: () => Promise<unknown> }[] = [
		{
			name: "drag left",
			run: () =>
				touch.drag(page, at, { x: at.x - 150, y: at.y }, { steps: 8 }),
		},
		{
			name: "drag up",
			run: () =>
				touch.drag(
					page,
					at,
					{ x: at.x, y: Math.max(1, at.y - 200) },
					{ steps: 8 },
				),
		},
		{
			name: "drag down",
			run: () =>
				touch.drag(
					page,
					at,
					{ x: at.x, y: Math.min(viewport.height - 1, at.y + 200) },
					{ steps: 8 },
				),
		},
		{
			name: "wheel down",
			run: async () => {
				await page.mouse.move(at.x, at.y);
				await page.mouse.wheel(0, 400);
			},
		},
		{
			name: "wheel sideways",
			run: async () => {
				await page.mouse.move(at.x, at.y);
				await page.mouse.wheel(400, 0);
			},
		},
	];
	const moved: string[] = [];
	for (const gesture of gestures) {
		const before = await scrollOffsets(page);
		await gesture.run();
		await page.waitForTimeout(120);
		const after = await scrollOffsets(page);
		for (const name of new Set([
			...Object.keys(before),
			...Object.keys(after),
		])) {
			const from = before[name] ?? { x: 0, y: 0, sideways: false };
			const to = after[name] ?? { x: 0, y: 0, sideways: false };
			const sidewaysOnly =
				(from.sideways || to.sideways) && from.y === to.y;
			if (sidewaysOnly || (from.x === to.x && from.y === to.y)) continue;
			moved.push(
				`${gesture.name}: ${name} ${from.x},${from.y} → ${to.x},${to.y}`,
			);
		}
	}
	return moved;
}

export async function structureViolations(page: Page): Promise<string[]> {
	const { violations } = await new AxeBuilder({ page })
		.withRules(STRUCTURE_RULES)
		.analyze();
	return violations.map(
		(violation) =>
			`${violation.id}: ${violation.nodes
				.slice(0, 3)
				.map((node) => node.target.join(" "))
				.join(" | ")}`,
	);
}
