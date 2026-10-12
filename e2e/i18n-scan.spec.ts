import { expect, type Page, test } from "@playwright/test";

import type * as Scan from "../src/lib/demo/screenshot-scan";
import type * as Markers from "../src/lib/i18n/markers";
import {
	animationsFinished,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";

const I18N_MODULE = "/src/lib/i18n/index.ts";
const MARKERS_MODULE = "/src/lib/i18n/markers.ts";
const SCAN_MODULE = "/src/lib/demo/screenshot-scan.ts";
const MARKER_LOCALE = "en-XM";
const FIXED_TIME = new Date("2026-07-21T13:12:00Z");
const FRACTIONAL_SCALE = 1.5;
const INBOX_ROW = 'main a[href^="/chat/"]';
const DRAWER_PILL =
	"[data-fixed-header] button:not([aria-label], [aria-pressed])";

test.describe.configure({ timeout: 180_000 });

async function openDemo(page: Page, { path }: { path: string }) {
	await page.clock.setFixedTime(FIXED_TIME);
	for (const host of [AVATAR_HOST, CHAT_MEDIA_HOST]) {
		await serveImages(page, host);
	}
	await installTauriShim(page, { platform: "android" });
	await page.goto(path);
}

async function switchToMarkers(page: Page): Promise<void> {
	await page.evaluate(
		async ({ module, locale }) => {
			const { setLocale } = await import(module);
			await setLocale({ locale });
		},
		{ module: I18N_MODULE, locale: MARKER_LOCALE },
	);
	await expect(page.locator("html")).toHaveAttribute("lang", MARKER_LOCALE);
}

function scan(page: Page): Promise<Scan.ViewScan> {
	return page.evaluate(async (module) => {
		const { scanView }: typeof Scan = await import(module);
		return scanView();
	}, SCAN_MODULE);
}

function shownKey(result: Scan.ViewScan, key: string) {
	const shown = result.keys.find((candidate) => candidate.key === key);
	return shown && { via: shown.via, top: shown.top };
}

async function mountFixture(page: Page): Promise<void> {
	await page.evaluate(async (module) => {
		const { markMessage }: typeof Markers = await import(module);
		const m = (key: string, message: string) =>
			markMessage({ key: `fixture.${key}`, message });
		const hiddenText =
			"position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
		const fixture = document.createElement("div");
		fixture.dataset.testFixture = "";
		fixture.style.cssText =
			"position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px;background:rgb(20 20 20);color:white;font:14px/1.3 sans-serif";
		fixture.innerHTML = `
			<p id="plain">${m("plain", "Plain")}</p>
			<p>${m("rich", 'Browse the <a href="#">Grid</a>.')}</p>
			<p>${m("outer", `Tap “${m("inner", "Sign in")}”.`)}</p>
			<p>${m("cut", "Truncated").slice(0, -4)}</p>
			<p>Plain English</p>
			<p translate="no">${m("untranslated", "Name")} Raw 🦊</p>
			<p id="inert" style="pointer-events:none">${m("inert", "Disabled")}</p>
			<div style="position:relative">
				<p>${m("covered", "Covered")}</p>
				<div style="position:absolute;inset:0;background:rgb(40 40 40)"></div>
			</div>
			<div style="position:relative">
				<p>${m("glass", "Under glass")}</p>
				<div style="position:absolute;inset:0;pointer-events:none;background:rgb(0 0 0 / 0.2)"></div>
			</div>
			<p style="opacity:0">${m("transparent", "Transparent")}</p>
			<p style="visibility:hidden">${m("invisible", "Invisible")}</p>
			<p style="display:none">${m("undisplayed", "Undisplayed")}</p>
			<p style="position:absolute;left:-1000px">${m("offscreen", "Offscreen")}</p>
			<div style="height:20px;overflow:hidden"><p style="margin-top:40px">${m("clipped", "Clipped")}</p></div>
			<button aria-label="${m("label", "Close")}" style="width:32px;height:32px"><svg width="16" height="16"><circle cx="8" cy="8" r="8" fill="white"/></svg></button>
			<img alt="${m("alt", "Photo")}" width="24" height="24" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'/%3E">
			<span title="${m("title", "Hint")}">i</span>
			<div><input value="${m("value", "Typed")}"> <input value="Typed 🦊" size="8"><input value="Unseen 🦊" style="display:none"></div>
			<input placeholder="${m("placeholder", "Search")}">
			<input value="Filled" placeholder="${m("filledPlaceholder", "Hidden")}">
			<button>OK<span style="${hiddenText}">${m("screenReader", "Close dialog")}</span></button>
			<div role="dialog"><p>${m("dialog", "In a dialog")}</p></div>
			<select><option>${m("selected", "Metric")}</option><option>${m("option", "Imperial")}</option></select>
		`;
		document.body.append(fixture);
	}, MARKERS_MODULE);
}

test("the scan names the keys a settings page shows", async ({ page }) => {
	await openDemo(page, { path: "/settings/app" });
	await page
		.locator("main h2")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await switchToMarkers(page);

	const result = await scan(page);

	expect(shownKey(result, "settings.subpage.titles.app")).toEqual({
		via: "text",
		top: false,
	});
	expect(result.keys.length).toBeGreaterThan(5);
	expect(result.emoji).toEqual([]);
});

test("the scan decodes, places and filters marked text", async ({ page }) => {
	await openDemo(page, { path: "/settings/app" });
	await page
		.locator("main h2")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await switchToMarkers(page);
	await mountFixture(page);

	const result = await scan(page);
	const text = { via: "text", top: false };
	const attribute = { via: "attribute", top: false };

	expect(
		Object.fromEntries(
			[
				"plain",
				"rich",
				"outer",
				"inner",
				"cut",
				"untranslated",
				"inert",
				"covered",
				"glass",
				"transparent",
				"invisible",
				"undisplayed",
				"offscreen",
				"clipped",
				"label",
				"alt",
				"title",
				"value",
				"placeholder",
				"filledPlaceholder",
				"screenReader",
				"dialog",
				"selected",
				"option",
			].map((name) => [name, shownKey(result, `fixture.${name}`)]),
		),
	).toEqual({
		plain: text,
		rich: text,
		outer: text,
		inner: text,
		cut: text,
		untranslated: undefined,
		inert: text,
		covered: undefined,
		glass: text,
		transparent: undefined,
		invisible: undefined,
		undisplayed: undefined,
		offscreen: undefined,
		clipped: undefined,
		label: attribute,
		alt: attribute,
		title: attribute,
		value: text,
		placeholder: text,
		filledPlaceholder: undefined,
		screenReader: attribute,
		dialog: { via: "text", top: true },
		selected: text,
		option: attribute,
	});
	expect(
		result.keys.filter(({ key }) => !key.startsWith("fixture.")),
	).toEqual([]);
	expect(result.unmarked).toEqual(["Plain English", "i", "OK"]);
	expect(result.emoji).toEqual(["Raw 🦊", "Typed 🦊"]);
});

test.describe("at a fractional device scale factor", () => {
	test.use({ deviceScaleFactor: FRACTIONAL_SCALE });

	test("the scan reports boxes in image pixels and leaves no style behind", async ({
		page,
	}) => {
		await openDemo(page, { path: "/settings/app" });
		await page
			.locator("main h2")
			.first()
			.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await mountFixture(page);
		expect(await page.evaluate(() => devicePixelRatio)).toBe(
			FRACTIONAL_SCALE,
		);
		const sheetsBefore = await page.evaluate(
			() => document.adoptedStyleSheets.length,
		);

		const result = await scan(page);

		const textBox = await page.locator("#plain").evaluate((element) => {
			const range = document.createRange();
			range.selectNodeContents(element);
			const { x, y, width, height } = range.getBoundingClientRect();
			const scale = devicePixelRatio;
			return [x, y, x + width, y + height].map((edge) =>
				Math.round(edge * scale),
			);
		});
		const box = result.keys.find(({ key }) => key === "fixture.plain")?.box;
		expect(
			box && [box.x, box.y, box.x + box.width, box.y + box.height],
		).toEqual(textBox);
		expect(
			await page.evaluate(() => document.adoptedStyleSheets.length),
		).toBe(sheetsBefore);
		expect(
			await page
				.locator("#inert")
				.evaluate((element) => getComputedStyle(element).pointerEvents),
		).toBe("none");
	});
});

test("the scan puts an open drawer in the top layer and hides the page behind its scrim", async ({
	page,
}) => {
	await openDemo(page, { path: "/chat" });
	await page
		.locator(INBOX_ROW)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await switchToMarkers(page);
	const inbox = await scan(page);
	await page.locator(DRAWER_PILL).first().click();
	const drawer = page.getByRole("dialog");
	await drawer.waitFor();
	await animationsFinished(drawer, { subtree: true });

	const drawerKeys = await drawer.evaluate(async (element, module) => {
		const { decodeMarkers }: typeof Markers = await import(module);
		return decodeMarkers(element.textContent ?? "").map(({ key }) => key);
	}, MARKERS_MODULE);
	const result = await scan(page);

	expect(inbox.keys.length).toBeGreaterThan(0);
	expect(inbox.keys.filter(({ top }) => top)).toEqual([]);
	expect(drawerKeys.length).toBeGreaterThan(0);
	for (const key of drawerKeys) {
		expect(shownKey(result, key), key).toEqual({ via: "text", top: true });
	}
	expect(result.keys.filter(({ top }) => !top)).toEqual([]);
});
