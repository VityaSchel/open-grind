import type { Page } from "@playwright/test";
import { isDeepStrictEqual } from "node:util";

import { OVERLAY_SELECTOR } from "../../src/lib/demo/screenshot-labels";
import type { ViewScan } from "../../src/lib/demo/screenshot-scan";
import { renderTwoFrames } from "../store-screenshots/settle";
import { settle } from "./settle";

export const SOURCE_LOCALE = "en";
export const MARKER_LOCALE = "en-XM";

const FRAME_ATTEMPTS = 3;
const STEADY_SHOTS = 5;
const STEADY_PAUSE_MS = 250;
const SCREENSHOT_TIMEOUT_MS = 120_000;

export type Frame = { png: Buffer; scan: ViewScan };

function scanFrame(page: Page): Promise<ViewScan> {
	return page.evaluate(() => {
		const hooks = window.__openGrindScreenshots;
		if (hooks === undefined) {
			throw new Error("The build installed no screenshot hooks");
		}
		return hooks.scan();
	});
}

function withoutBoxes({
	keys,
	titleKeys,
	unmarked,
	emoji,
	measured,
	compositeButtons,
}: ViewScan) {
	return {
		keys: keys.map(({ box: _box, boxes: _boxes, ...labels }) => labels),
		titleKeys,
		unmarked,
		emoji,
		measured,
		compositeButtons,
	};
}

function screenshot(page: Page): Promise<Buffer> {
	return page.screenshot({
		animations: "disabled",
		timeout: SCREENSHOT_TIMEOUT_MS,
	});
}

async function steadyScreenshot(page: Page): Promise<Buffer> {
	let previous = await screenshot(page);
	for (let shot = 2; shot <= STEADY_SHOTS; shot += 1) {
		await renderTwoFrames(page);
		await page.waitForTimeout(STEADY_PAUSE_MS);
		const png = await screenshot(page);
		if (png.equals(previous)) return png;
		previous = png;
	}
	throw new Error(
		`No two screenshots in a row matched over ${STEADY_SHOTS} screenshots`,
	);
}

export async function captureFrame(page: Page): Promise<Frame> {
	for (let attempt = 1; ; attempt += 1) {
		const scan = await scanFrame(page);
		const png = await steadyScreenshot(page);
		const rescan = await scanFrame(page);
		if (isDeepStrictEqual(withoutBoxes(scan), withoutBoxes(rescan))) {
			return { png, scan };
		}
		if (attempt === FRAME_ATTEMPTS) {
			throw new Error(
				`The view changed between its scan and its screenshot ${FRAME_ATTEMPTS} times`,
			);
		}
		await settle({ page });
	}
}

export async function recordSourceLayout(page: Page): Promise<void> {
	await page.evaluate(() => {
		const hooks = window.__openGrindScreenshots;
		if (hooks === undefined) {
			throw new Error("The build installed no screenshot hooks");
		}
		hooks.recordSourceLayout();
	});
}

export function matchSourceLayout(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const hooks = window.__openGrindScreenshots;
		if (hooks === undefined) {
			throw new Error("The build installed no screenshot hooks");
		}
		return hooks.matchSourceLayout();
	});
}

export function viewState(page: Page): Promise<string> {
	return page.evaluate((overlays) => {
		const scrolled = [...document.querySelectorAll("*")]
			.filter(
				({ scrollTop, scrollLeft }) => scrollTop > 0 || scrollLeft > 0,
			)
			.map(
				({ scrollTop, scrollLeft }) =>
					`${Math.round(scrollTop)},${Math.round(scrollLeft)}`,
			);
		const open = [...document.querySelectorAll(overlays)].filter(
			(overlay) => overlay.checkVisibility(),
		).length;
		return JSON.stringify({ href: location.href, open, scrolled });
	}, OVERLAY_SELECTOR);
}

export async function waitForLocale({
	page,
	locale,
}: {
	page: Page;
	locale: string;
}): Promise<void> {
	await page.waitForFunction(
		(expected) => document.documentElement.lang === expected,
		locale,
	);
}

export async function switchLocale({
	page,
	locale,
}: {
	page: Page;
	locale: string;
}): Promise<void> {
	await page.evaluate(async (target) => {
		const hooks = window.__openGrindScreenshots;
		if (hooks === undefined) {
			throw new Error("The build installed no screenshot hooks");
		}
		await hooks.setLocale({ locale: target });
	}, locale);
	await waitForLocale({ page, locale });
	await settle({ page });
}
