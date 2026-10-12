import { expect, type Locator, type Page, test } from "@playwright/test";
import sharp from "sharp";

import {
	brokenImagesOnceReady,
	renderTwoFrames,
} from "../scripts/store-screenshots/settle";
import type * as Markers from "../src/lib/i18n/markers";
import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";

const I18N_MODULE = "/src/lib/i18n/index.ts";
const MARKERS_MODULE = "/src/lib/i18n/markers.ts";
const MARKER_LOCALE = "en-XM";
const FIXED_TIME = new Date("2026-07-21T13:12:00Z");
const PHOTO_HOSTS = [
	AVATAR_HOST,
	CHAT_MEDIA_HOST,
	"**/images.unsplash.com/**",
	"**/cdns.grindr.com/**",
];
const AUTH_LAYOUT_LOAD = /\/routes\/auth\/\+layout\.ts(?:\?|$)/;
const SIGNED_OUT_LOAD = "export const load = () => {};";
const INBOX_ROW = 'main a[href^="/chat/"]';
const INBOX_SCROLLER = '[data-slot="conversations-scroller"]';
const DRAWER_PILL =
	"[data-fixed-header] button:not([aria-label], [aria-pressed])";
const UNSPACED_LETTERS =
	"*, ::before, ::after { letter-spacing: 0 !important; }";
const CHANNEL_TOLERANCE = 2;
const MAX_DIFFERING_SHARE = 0.0001;

test.describe.configure({ timeout: 180_000 });

interface MarkerView {
	name: string;
	path: string;
	ready: string;
}

const views: readonly MarkerView[] = [
	{ name: "App Settings", path: "/settings/app", ready: "main h2" },
	{ name: "inbox", path: "/chat", ready: INBOX_ROW },
	{ name: "profile", path: "/profile/100001", ready: "main h1" },
];

async function openDemo(page: Page, { path }: { path: string }): Promise<void> {
	await page.clock.setFixedTime(FIXED_TIME);
	for (const host of PHOTO_HOSTS) await serveImages(page, host);
	await installTauriShim(page, { platform: "android" });
	await page.goto(path);
}

async function settle(page: Page): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
	await renderTwoFrames(page);
	expect(await brokenImagesOnceReady(page)).toEqual([]);
	await renderTwoFrames(page);
}

async function switchLocale(
	page: Page,
	{ locale }: { locale: string },
): Promise<void> {
	await page.evaluate(
		async ({ module, locale }) => {
			const { setLocale } = await import(module);
			await setLocale({ locale });
		},
		{ module: I18N_MODULE, locale },
	);
	await expect(page.locator("html")).toHaveAttribute("lang", locale);
	await settle(page);
}

function readMarkers(root: Locator): Promise<Markers.MarkerSpan[]> {
	return root.evaluate(async (element, module) => {
		const { MarkerReader }: typeof Markers = await import(module);
		const reader = new MarkerReader();
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		while (walker.nextNode())
			reader.read(walker.currentNode.nodeValue ?? "");
		return reader.spans;
	}, MARKERS_MODULE);
}

function visibleText(root: Locator): Promise<string> {
	return root.evaluate(async (element, module) => {
		const { stripMarkers }: typeof Markers = await import(module);
		return stripMarkers(element.textContent ?? "");
	}, MARKERS_MODULE);
}

function sourceText(page: Page, key: string): Promise<string> {
	return page.evaluate(
		async ({ module, key }) => {
			const i18n = await import(module);
			return i18n.sourceText(key);
		},
		{ module: I18N_MODULE, key },
	);
}

function rgba(png: Buffer) {
	return sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function differingShare(first: Buffer, second: Buffer): Promise<number> {
	const [a, b] = await Promise.all([rgba(first), rgba(second)]);
	expect([b.info.width, b.info.height]).toEqual([
		a.info.width,
		a.info.height,
	]);
	let count = 0;
	for (let offset = 0; offset < a.data.length; offset += 4) {
		for (let channel = 0; channel < 4; channel += 1) {
			const delta = Math.abs(
				(a.data[offset + channel] ?? 0) -
					(b.data[offset + channel] ?? 0),
			);
			if (delta > CHANNEL_TOLERANCE) {
				count += 1;
				break;
			}
		}
	}
	return count / (a.info.width * a.info.height);
}

function capture(page: Page): Promise<Buffer> {
	return page.screenshot({ animations: "disabled", caret: "hide" });
}

test("markers name the keys of plain, rich and nested messages and add no visible text", async ({
	page,
}) => {
	await page.route(AUTH_LAYOUT_LOAD, (route) =>
		route.fulfill({
			contentType: "text/javascript",
			body: SIGNED_OUT_LOAD,
		}),
	);
	await page.goto("/auth/sign-in/google");
	const content = page.getByRole("main");
	const steps = content.locator("ol > li");
	await expect(steps).toHaveCount(3, { timeout: FIRST_ROUTE_COMPILE_MS });
	const english = {
		content: await visibleText(content),
		steps: (await steps.allTextContents()).map((text) => text.trim()),
		submit: await sourceText(page, "auth.signIn.submit"),
	};

	await switchLocale(page, { locale: MARKER_LOCALE });

	expect(await readMarkers(content.locator("ol"))).toEqual([
		{
			key: "auth.signIn.google.paste.steps.install",
			text: english.steps[0],
			closed: true,
		},
		{
			key: "auth.signIn.google.paste.steps.copyToken",
			text: english.steps[1],
			closed: true,
		},
		{
			key: "auth.signIn.google.paste.steps.submit",
			text: english.steps[2],
			closed: true,
		},
		{ key: "auth.signIn.submit", text: english.submit, closed: true },
	]);
	expect(english.steps[2]).toContain(english.submit);
	expect(await visibleText(content)).toBe(english.content);
	const spans = await readMarkers(content);
	expect(spans.length).toBeGreaterThan(4);
	expect(spans.filter(({ closed }) => !closed)).toEqual([]);
});

for (const { name, path, ready } of views) {
	test(`the ${name} looks the same in en and ${MARKER_LOCALE}`, async ({
		page,
	}) => {
		await openDemo(page, { path });
		await page
			.locator(ready)
			.first()
			.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await page.addStyleTag({ content: UNSPACED_LETTERS });
		await settle(page);
		const english = await capture(page);

		await switchLocale(page, { locale: MARKER_LOCALE });
		expect(
			(await readMarkers(page.locator("body"))).length,
		).toBeGreaterThan(0);
		const marked = await capture(page);

		const share = await differingShare(english, marked);
		test.info().annotations.push({
			type: "differing pixels",
			description: String(share),
		});
		expect(share).toBeLessThanOrEqual(MAX_DIFFERING_SHARE);
	});
}

test("an open drawer and the scroll offset survive the switch to en-XM", async ({
	page,
}) => {
	await openDemo(page, { path: "/chat" });
	const scroller = page.locator(INBOX_SCROLLER);
	await page
		.locator(INBOX_ROW)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	const offset = () => scroller.evaluate((element) => element.scrollTop);
	const middle = await scroller.evaluate((element) => {
		const top = Math.floor(
			(element.scrollHeight - element.clientHeight) / 2,
		);
		element.scrollTo({ top });
		return top;
	});
	expect(middle).toBeGreaterThan(0);
	await expect.poll(offset).toBe(middle);
	await page.locator(DRAWER_PILL).first().click();
	const drawer = page.getByRole("dialog");
	await drawer.waitFor();
	const opened = await drawer.elementHandle();

	await switchLocale(page, { locale: MARKER_LOCALE });

	expect(await opened?.evaluate((element) => element.isConnected)).toBe(true);
	await expect(drawer).toBeVisible();
	expect((await readMarkers(drawer)).length).toBeGreaterThan(0);
	expect(await offset()).toBe(middle);
});
