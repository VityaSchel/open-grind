import { expect, type Locator, type Page } from "@playwright/test";

import type * as Scan from "../../src/lib/demo/screenshot-scan";
import {
	animationsFinished,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./media";

const I18N_MODULE = "/src/lib/i18n/index.ts";
const SCAN_MODULE = "/src/lib/demo/screenshot-scan.ts";
const MARKER_LOCALE = "en-XM";
const FIXED_TIME = new Date("2026-07-21T13:12:00Z");
const INBOX_ROW = 'main a[href^="/chat/"]';
const DRAWER_PILL =
	"[data-fixed-header] button:not([aria-label], [aria-pressed])";
const AUTH_LAYOUT_LOAD = /\/routes\/auth\/\+layout\.ts(?:\?|$)/;
const SIGNED_OUT_LOAD = "export const load = () => {};";

export const MARKERS_MODULE = "/src/lib/i18n/markers.ts";
export const LAYOUT_MODULE = "/src/lib/demo/screenshot-layout.ts";

async function openDemo(page: Page, { path }: { path: string }): Promise<void> {
	await page.clock.setFixedTime(FIXED_TIME);
	for (const host of [AVATAR_HOST, CHAT_MEDIA_HOST]) {
		await serveImages(page, host);
	}
	await installTauriShim(page, { platform: "android" });
	await page.goto(path);
}

export async function openAppSettings(page: Page): Promise<void> {
	await openDemo(page, { path: "/settings/app" });
	await page
		.locator('main a[href="/settings/app/credits"]')
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

export async function openCredits(page: Page): Promise<void> {
	await openDemo(page, { path: "/settings/app/credits" });
	await page
		.getByRole("link", { name: "Suggest an edit" })
		.waitFor({ state: "attached", timeout: FIRST_ROUTE_COMPILE_MS });
}

export async function openSignIn(page: Page): Promise<void> {
	await page.route(AUTH_LAYOUT_LOAD, (route) =>
		route.fulfill({
			contentType: "text/javascript",
			body: SIGNED_OUT_LOAD,
		}),
	);
	await openDemo(page, { path: "/auth/sign-in" });
	await page
		.locator("form button[type=submit]")
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

export async function openInbox(page: Page): Promise<void> {
	await openDemo(page, { path: "/chat" });
	await page
		.locator(INBOX_ROW)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

export async function openInboxDrawer(page: Page): Promise<Locator> {
	await page.locator(DRAWER_PILL).first().click();
	const drawer = page.getByRole("dialog");
	await drawer.waitFor();
	await animationsFinished(drawer, { subtree: true });
	return drawer;
}

export async function switchToMarkers(page: Page): Promise<void> {
	await page.evaluate(
		async ({ module, locale }) => {
			const { setLocale } = await import(module);
			await setLocale({ locale });
		},
		{ module: I18N_MODULE, locale: MARKER_LOCALE },
	);
	await expect(page.locator("html")).toHaveAttribute("lang", MARKER_LOCALE);
}

export function scan(page: Page): Promise<Scan.ViewScan> {
	return page.evaluate(async (module) => {
		const { scanView }: typeof Scan = await import(module);
		return scanView();
	}, SCAN_MODULE);
}
