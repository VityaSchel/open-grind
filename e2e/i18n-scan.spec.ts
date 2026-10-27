import { expect, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import type * as Scan from "../src/lib/demo/screenshot-scan";
import type * as Markers from "../src/lib/i18n/markers";
import {
	MARKERS_MODULE,
	openAppSettings,
	openInbox,
	openInboxDrawer,
	openSignIn,
	scan,
	switchToMarkers,
} from "./support/scan";

test.use({ baseURL: DEV_SERVER_URL });

const FRACTIONAL_SCALE = 1.5;

test.describe.configure({ timeout: 180_000 });

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
			<p>${m("twice", "Twice")}</p>
			<p>${m("twice", "Twice")}</p>
			<p>${m("rich", 'Browse the <a href="#">Grid</a>.')}</p>
			<p>${m("outer", `Tap “${m("inner", "Sign in")}”.`)}</p>
			<p>${m("cut", "Truncated").slice(0, -4)}</p>
			<p>Plain English</p>
			<p translate="no">${m("untranslated", "Name")} Raw 🦊</p>
			<p translate="no"><span translate="yes">${m("retranslated", "Draft:")}</span> Raw</p>
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
			<nav aria-label="${m("boxless", "Back")}"><a href="#back" style="position:fixed;right:8px;bottom:8px;width:24px;height:24px;background:white"></a></nav>
			<span aria-label="${m("empty", "Nothing")}"></span>
			<div><input value="${m("value", "Typed")}"> <input value="Typed 🦊" size="8"><input value="Unseen 🦊" style="display:none"></div>
			<input placeholder="${m("placeholder", "Search")}">
			<input value="Filled" placeholder="${m("filledPlaceholder", "Hidden")}">
			<button>OK<span style="${hiddenText}">${m("screenReader", "Close dialog")}</span></button>
			<div style="width:120px;height:24px"><h2 style="${hiddenText};padding:16px">${m("paddedScreenReader", "Choose Location")}</h2></div>
			<div role="dialog"><p>${m("dialog", "In a dialog")}</p></div>
			<select><option>${m("selected", "Metric")}</option><option>${m("option", "Imperial")}</option></select>
		`;
		document.body.append(fixture);
	}, MARKERS_MODULE);
}

test("the scan names the keys a settings page shows", async ({ page }) => {
	await openAppSettings(page);
	await switchToMarkers(page);

	const result = await scan(page);

	expect(shownKey(result, "settings.subpage.titles.app")).toEqual({
		via: "text",
		top: false,
	});
	expect(result.keys.length).toBeGreaterThan(5);
	expect(result.emoji).toEqual([]);
});

test("the scan reads the document title's keys apart from the page's", async ({
	page,
}) => {
	await openSignIn(page);
	await switchToMarkers(page);

	const signIn = await scan(page);
	await page.evaluate(async (module) => {
		const { markMessage }: typeof Markers = await import(module);
		const inner = markMessage({ key: "fixture.inner", message: "Grid" });
		document.title = markMessage({
			key: "fixture.outer",
			message: `${inner} and ${inner}`,
		});
	}, MARKERS_MODULE);
	const nested = await scan(page);

	expect(signIn.titleKeys).toEqual(["auth.signIn.title"]);
	expect(shownKey(signIn, "auth.signIn.title")).toBeUndefined();
	expect(shownKey(signIn, "auth.signIn.submit")).toEqual({
		via: "text",
		top: false,
	});
	expect(nested.titleKeys).toEqual(["fixture.inner", "fixture.outer"]);
	expect(nested.keys).toEqual(signIn.keys);
});

test("the scan decodes, places and filters marked text", async ({ page }) => {
	await openAppSettings(page);
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
				"retranslated",
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
				"boxless",
				"empty",
				"value",
				"placeholder",
				"filledPlaceholder",
				"screenReader",
				"paddedScreenReader",
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
		retranslated: text,
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
		boxless: attribute,
		empty: undefined,
		value: text,
		placeholder: text,
		filledPlaceholder: undefined,
		screenReader: attribute,
		paddedScreenReader: attribute,
		dialog: { via: "text", top: true },
		selected: text,
		option: attribute,
	});
	expect(
		result.keys.filter(({ key }) => !key.startsWith("fixture.")),
	).toEqual([]);
	const twice = result.keys.find(({ key }) => key === "fixture.twice");
	const [above, below] = twice?.boxes ?? [];
	expect(twice?.boxes).toHaveLength(2);
	expect(above && below && below.y >= above.y + above.height).toBe(true);
	expect(twice?.box).toEqual(above);
	expect(result.unmarked).toEqual(["Plain English", "i", "OK"]);
	expect(result.emoji).toEqual(["Raw 🦊", "Typed 🦊"]);
});

test("the scan measures animated text where the screenshot shows it", async ({
	page,
}) => {
	await openAppSettings(page);
	await page.evaluate(async (module) => {
		const { markMessage }: typeof Markers = await import(module);
		const fixture = document.createElement("div");
		fixture.style.cssText =
			"position:fixed;inset:0;z-index:2147483647;padding:40px;background:rgb(20 20 20);color:white;font:14px/1 sans-serif";
		fixture.innerHTML = `
			<p id="arriving" style="width:100px">${markMessage({ key: "fixture.arriving", message: "Arriving" })}</p>
			<p id="spinning" style="width:100px;height:20px;margin-top:80px">${markMessage({ key: "fixture.spinning", message: "Spinning" })}</p>
		`;
		document.body.append(fixture);
		fixture
			.querySelector("#arriving")
			?.animate([{ translate: "0 300px" }, { translate: "0 0" }], {
				duration: 100_000,
			});
		fixture
			.querySelector("#spinning")
			?.animate([{ rotate: "0deg" }, { rotate: "360deg" }], {
				duration: 4000,
				delay: -1000,
				iterations: Infinity,
			});
	}, MARKERS_MODULE);
	const arrivingTop = await page
		.locator("#arriving")
		.evaluate((element) => element.getBoundingClientRect().top);

	const result = await scan(page);

	const box = (name: string) =>
		result.keys.find(({ key }) => key === `fixture.${name}`)?.box;
	const scale = await page.evaluate(() => devicePixelRatio);
	const arriving = box("arriving");
	const spinning = box("spinning");
	expect(arriving && arriving.y < (arrivingTop - 200) * scale).toBe(true);
	expect(spinning && spinning.width > spinning.height).toBe(true);
	expect(
		await page.evaluate(() =>
			document
				.querySelector("#spinning")
				?.getAnimations()
				.map(({ playState }) => playState),
		),
	).toEqual(["running"]);
});

test.describe("at a fractional device scale factor", () => {
	test.use({ deviceScaleFactor: FRACTIONAL_SCALE });

	test("the scan reports boxes in image pixels and leaves no style behind", async ({
		page,
	}) => {
		await openAppSettings(page);
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
		const plain = result.keys.find(({ key }) => key === "fixture.plain");
		const box = plain?.box;
		expect(plain?.boxes).toEqual([box]);
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

test("the scan puts an open drawer in the top layer as a sheet and hides the page behind its scrim", async ({
	page,
}) => {
	await openInbox(page);
	await switchToMarkers(page);
	const inbox = await scan(page);
	const drawer = await openInboxDrawer(page);

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
	expect(new Set(result.keys.map(({ overlay }) => overlay))).toEqual(
		new Set(["sheet"]),
	);
});
