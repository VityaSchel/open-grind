import { expect, type Locator, type Page, test } from "@playwright/test";

import type * as Layout from "../src/lib/demo/screenshot-layout";
import type * as Scan from "../src/lib/demo/screenshot-scan";
import type * as Markers from "../src/lib/i18n/markers";
import { afterTwoFrames, animationsFinished } from "./support/app";
import {
	LAYOUT_MODULE,
	MARKERS_MODULE,
	openAppSettings,
	openCredits,
	openInbox,
	openInboxDrawer,
	scan,
	switchToMarkers,
} from "./support/scan";

const ERROR_TOAST_MODULE = "/src/lib/api/error-toast.ts";
const IMAGE =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'/%3E";
const CREDIT_ROW = '[data-slot="credit-row"]';
const SUBPAGE_SCROLLER = '[data-slot="subpage-scroller"]';
const HIDDEN_TEXT =
	"position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";

const BUTTONS = `
	<button>{buttonText|Save}</button>
	<button aria-label="{iconButton|Close}" style="width:32px;height:32px"><svg width="16" height="16"><circle cx="8" cy="8" r="8" fill="white"/></svg></button>
	<div role="button" tabindex="0">{roleButton|Edit}</div>
	<input type="submit" value="{submit|Send}">
	<button title="{titled|Refresh}" style="width:32px;height:32px"></button>
	<button>{cardName|Sam} {cardAge|25} {cardDistance|2 km}</button>
	<button>{pairOne|One} {pairTwo|Two}</button>
	<p>{plain|Plain}</p>
	<img alt="{photo|Photo}" width="24" height="24" src="${IMAGE}">
	<div role="dialog" data-vaul-drawer>
		<p>{sheet|In a sheet}</p>
		<ol><li data-sonner-toast style="position:static;opacity:1;transform:none"><p>{toast|Saved}</p></li></ol>
	</div>
	<div role="menu"><p>{menu|Menu}</p></div>
	<div role="listbox"><p>{listbox|Listbox}</p></div>
	<dialog open style="position:static;margin:0"><p>{dialog|Dialog}</p></dialog>
	<div role="alertdialog"><p>{alert|Alert}</p></div>
	<div role="tooltip"><p>{tooltip|Tooltip}</p></div>
	<div id="popover" popover style="inset:8px 8px auto auto;margin:0"><p>{popover|Popover}</p></div>
`;

const TEXT = `
	<p style="width:120px">{wrapped|A sentence long enough to wrap}</p>
	<p>{bold|Tap <b style="font-size:20px">Save</b> to keep it}</p>
	<p>{single|One line}</p>
	<p style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">{ellipsisLead|Go} {ellipsis|on, much too long to fit}</p>
	<p style="width:120px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden">{clampLead|Short} {clamped|and then a tail long enough to need more than two lines}</p>
	<div style="width:160px;height:40px;overflow:hidden"><p style="margin:0">{card|Fits}</p><img width="320" height="200" src="${IMAGE}"></div>
	<div id="scroller" style="width:100px;overflow-x:auto;white-space:nowrap"><span>{sideways|Text that runs past the edge}</span></div>
	<div style="width:100px;overflow-x:hidden;overflow-y:auto;white-space:nowrap">{scrolled|Text that runs past the edge}</div>
	<div style="width:100px;overflow:hidden;white-space:nowrap">{cut|Text that runs past the edge}</div>
	<p style="width:300px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:500 14px/1 var(--font-sans)">{tight|Redact personal data (recommended)}</p>
	<p style="width:150px">{example|Search, e.g. <code translate="no">online fresh distance age position</code>}</p>
	<img alt="{photo|Photo}" width="24" height="24" src="${IMAGE}">
	<button>OK<span style="${HIDDEN_TEXT}">{screenReader|Close the dialog and go back}</span></button>
`;

type Labels = Omit<Scan.ShownKey, "key" | "box">;

test.describe.configure({ timeout: 180_000 });

async function mountFixture({
	page,
	template,
}: {
	page: Page;
	template: string;
}): Promise<void> {
	await page.evaluate(
		async ({ module, html }) => {
			const { markMessage }: typeof Markers = await import(module);
			const fixture = document.createElement("div");
			fixture.id = "fixture";
			fixture.style.cssText =
				"position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px;background:rgb(20 20 20);color:white;font:14px/1.3 sans-serif";
			fixture.innerHTML = `<style>#fixture p, #fixture ol { margin: 0; }</style>${html.replace(
				/\{(\w+)\|([^}]*)\}/g,
				(_, key: string, message: string) =>
					markMessage({ key: `fixture.${key}`, message }),
			)}`;
			document.body.append(fixture);
			fixture.querySelector<HTMLElement>("#popover")?.showPopover();
		},
		{ module: MARKERS_MODULE, html: template },
	);
}

function recordEnglish(page: Page): Promise<void> {
	return page.evaluate(async (module) => {
		const { recordSourceLayout }: typeof Layout = await import(module);
		recordSourceLayout();
	}, LAYOUT_MODULE);
}

function matchEnglish(page: Page): Promise<boolean> {
	return page.evaluate(async (module) => {
		const { matchSourceLayout }: typeof Layout = await import(module);
		return matchSourceLayout();
	}, LAYOUT_MODULE);
}

function keysIn(layer: Locator): Promise<string[]> {
	return layer.evaluate(async (element, module) => {
		const { decodeMarkers }: typeof Markers = await import(module);
		const labels = [...element.querySelectorAll("[aria-label]")].map(
			(labelled) => labelled.getAttribute("aria-label") ?? "",
		);
		return [element.textContent ?? "", ...labels].flatMap((text) =>
			decodeMarkers(text).map(({ key }) => key),
		);
	}, MARKERS_MODULE);
}

function labelsOf(result: Scan.ViewScan): Record<string, Labels> {
	return Object.fromEntries(
		result.keys
			.filter(({ key }) => key.startsWith("fixture."))
			.map(({ key, via, top, button, overlay, wraps, clipped }) => [
				key.slice("fixture.".length),
				{ via, top, button, overlay, wraps, clipped },
			]),
	);
}

function laidOut({
	result,
	names,
}: {
	result: Scan.ViewScan;
	names: string[];
}) {
	const labels = labelsOf(result);
	return Object.fromEntries(
		names.map((name) => {
			const shown = labels[name];
			return [
				name,
				shown && { wraps: shown.wraps, clipped: shown.clipped },
			];
		}),
	);
}

const TEXT_NAMES = [
	"wrapped",
	"bold",
	"single",
	"ellipsisLead",
	"ellipsis",
	"clampLead",
	"clamped",
	"card",
	"sideways",
	"scrolled",
	"cut",
	"tight",
	"example",
	"photo",
	"screenReader",
];

test("the scan labels buttons, overlays and composite buttons", async ({
	page,
}) => {
	await openAppSettings(page);
	await mountFixture({ page, template: BUTTONS });

	const result = await scan(page);

	const text = { via: "text", top: false };
	const attribute = { via: "attribute", top: false };
	const button = { button: true };
	const over = (overlay: string) => ({ via: "text", top: true, overlay });
	expect(labelsOf(result)).toEqual({
		buttonText: { ...text, ...button },
		iconButton: { ...attribute, ...button },
		roleButton: { ...text, ...button },
		submit: { ...text, ...button },
		titled: { ...attribute, ...button },
		cardName: { ...text, ...button },
		cardAge: { ...text, ...button },
		cardDistance: { ...text, ...button },
		pairOne: { ...text, ...button },
		pairTwo: { ...text, ...button },
		plain: text,
		photo: attribute,
		sheet: over("sheet"),
		toast: over("toast"),
		menu: over("menu"),
		listbox: over("menu"),
		dialog: over("dialog"),
		alert: over("dialog"),
		tooltip: over("popover"),
		popover: over("popover"),
	});
	expect(result.compositeButtons).toEqual([
		["fixture.cardAge", "fixture.cardDistance", "fixture.cardName"],
	]);
	expect(result.measured).toBe(false);
});

test("the scan tells a toast from the sheet it shows over", async ({
	page,
}) => {
	await openInbox(page);
	await switchToMarkers(page);
	const drawer = await openInboxDrawer(page);
	await page.evaluate(
		async ({ markers, toasts }) => {
			const { markMessage }: typeof Markers = await import(markers);
			const { showErrorToast } = await import(toasts);
			showErrorToast({
				label: markMessage({ key: "fixture.toast", message: "Saved" }),
				error: new Error("saved"),
			});
		},
		{ markers: MARKERS_MODULE, toasts: ERROR_TOAST_MODULE },
	);
	const toast = page.locator('[data-sonner-toast][data-mounted="true"]');
	await toast.waitFor();
	await animationsFinished(toast);

	const result = await scan(page);

	const kinds = new Map(
		result.keys.map(({ key, overlay }) => [key, overlay]),
	);
	const shown = (keys: string[]) => keys.filter((key) => kinds.has(key));
	const sheetKeys = shown(await keysIn(drawer));
	const toastKeys = shown(await keysIn(toast));
	expect(sheetKeys.length).toBeGreaterThan(0);
	expect(toastKeys).toContain("fixture.toast");
	expect(
		Object.fromEntries(
			[...sheetKeys, ...toastKeys].map((key) => [key, kinds.get(key)]),
		),
	).toEqual({
		...Object.fromEntries(sheetKeys.map((key) => [key, "sheet"])),
		...Object.fromEntries(toastKeys.map((key) => [key, "toast"])),
	});
	for (const { key, top, overlay } of result.keys) {
		expect(overlay !== undefined, key).toBe(top);
	}
});

test("the scan tells wrapped and clipped text in a view laid out as in English", async ({
	page,
}) => {
	await openAppSettings(page);
	await mountFixture({ page, template: TEXT });
	await recordEnglish(page);
	expect(await matchEnglish(page)).toBe(true);

	const result = await scan(page);

	expect(result.measured).toBe(true);
	expect(laidOut({ result, names: TEXT_NAMES })).toEqual({
		wrapped: { wraps: true, clipped: undefined },
		bold: { wraps: undefined, clipped: undefined },
		single: { wraps: undefined, clipped: undefined },
		ellipsisLead: { wraps: undefined, clipped: true },
		ellipsis: { wraps: undefined, clipped: true },
		clampLead: { wraps: undefined, clipped: true },
		clamped: { wraps: true, clipped: true },
		card: { wraps: undefined, clipped: undefined },
		sideways: { wraps: undefined, clipped: undefined },
		scrolled: { wraps: undefined, clipped: true },
		cut: { wraps: undefined, clipped: true },
		tight: { wraps: undefined, clipped: undefined },
		example: { wraps: true, clipped: undefined },
		photo: { wraps: undefined, clipped: undefined },
		screenReader: { wraps: undefined, clipped: undefined },
	});
	expect(labelsOf(result).screenReader?.via).toBe("attribute");
});

test("the scan leaves wraps and clipped out of a view laid out unlike English", async ({
	page,
}) => {
	await openAppSettings(page);
	await mountFixture({ page, template: TEXT });
	const unmeasured = Object.fromEntries(
		TEXT_NAMES.map((name) => [
			name,
			{ wraps: undefined, clipped: undefined },
		]),
	);

	const replayed = await scan(page);
	await recordEnglish(page);
	await page
		.locator("#fixture p")
		.first()
		.evaluate((element) => {
			element.style.width = "400px";
		});
	const moved = await matchEnglish(page);
	const unlike = await scan(page);

	expect(replayed.measured).toBe(false);
	expect(laidOut({ result: replayed, names: TEXT_NAMES })).toEqual(
		unmeasured,
	);
	expect(moved).toBe(false);
	expect(unlike.measured).toBe(false);
	expect(laidOut({ result: unlike, names: TEXT_NAMES })).toEqual(unmeasured);
});

test("the scan measures a scrolled view until text the English render lacked shows", async ({
	page,
}) => {
	await openAppSettings(page);
	await mountFixture({ page, template: TEXT });
	await recordEnglish(page);
	await matchEnglish(page);

	await page.locator("#scroller").evaluate((element) => {
		element.scrollLeft = 60;
	});
	const scrolled = await scan(page);
	await page.locator("#fixture").evaluate((element) => {
		element.insertAdjacentHTML("afterbegin", "<p>Loaded later</p>");
	});
	const grown = await scan(page);

	expect(scrolled.measured).toBe(true);
	expect(labelsOf(scrolled).cut?.clipped).toBe(true);
	expect(grown.measured).toBe(false);
	expect(labelsOf(grown).cut?.clipped).toBeUndefined();
});

test("the scan compares credit rows that content-visibility skips below the fold", async ({
	page,
}) => {
	await openCredits(page);
	const skipped = await page
		.locator(CREDIT_ROW)
		.last()
		.evaluate(
			(row) =>
				row.firstElementChild?.checkVisibility({
					contentVisibilityAuto: true,
				}) === false,
		);

	await recordEnglish(page);
	await switchToMarkers(page);
	const matched = await matchEnglish(page);
	await page.locator(SUBPAGE_SCROLLER).evaluate((scroller) => {
		scroller.scrollBy({ top: scroller.clientHeight, behavior: "instant" });
	});
	await afterTwoFrames(page);
	const scrolled = await scan(page);

	expect(skipped).toBe(true);
	expect(matched).toBe(true);
	expect(scrolled.measured).toBe(true);
});
