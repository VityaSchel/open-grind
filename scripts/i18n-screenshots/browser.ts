import {
	type Browser,
	type BrowserContext,
	chromium,
	devices,
} from "@playwright/test";

import playwrightConfig from "../../playwright.config";
import {
	GPU_COMPOSITING_ON_SWIFTSHADER,
	requireGpuCompositing,
} from "../store-screenshots/gpu";
import { serveLocalMedia } from "./images";
import type { Platform } from "./manifest";
import { guardNetwork, type NetworkGuard, openEscapeSink } from "./network";

const SCENE_TIMEOUT_MS = 30_000;
const RASTER_EVERY_TILE_BEFORE_DRAW = "--run-all-compositor-stages-before-draw";
const RESOLVE_ONLY_LOCALHOST =
	"--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1";

export const displays = {
	phone: {
		viewport: { width: 420, height: 800 },
		deviceScaleFactor: 2,
		shimPlatform: "android",
	},
	desktop: {
		viewport: { width: 1280, height: 800 },
		deviceScaleFactor: 1.5,
		shimPlatform: "macos",
	},
} satisfies Record<Platform, unknown>;

export type PlatformContext = {
	context: BrowserContext;
	guard: NetworkGuard;
	origin: string;
	platform: Platform;
};

export async function launchBrowser(): Promise<Browser> {
	const launchOptions = playwrightConfig.use?.launchOptions;
	const browser = await chromium.launch({
		...launchOptions,
		args: [
			...(launchOptions?.args ?? []),
			GPU_COMPOSITING_ON_SWIFTSHADER,
			RASTER_EVERY_TILE_BEFORE_DRAW,
			RESOLVE_ONLY_LOCALHOST,
		],
	});
	try {
		await requireGpuCompositing(browser);
	} catch (error) {
		await browser.close();
		throw error;
	}
	return browser;
}

export async function openPlatformContext({
	browser,
	platform,
	origin,
}: {
	browser: Browser;
	platform: Platform;
	origin: string;
}): Promise<PlatformContext> {
	const { viewport, deviceScaleFactor } = displays[platform];
	const escapes = openEscapeSink();
	const context = await browser.newContext({
		...devices["Desktop Chrome"],
		baseURL: origin,
		viewport,
		deviceScaleFactor,
		hasTouch: true,
		locale: "en-US",
		timezoneId: "UTC",
		colorScheme: "dark",
		reducedMotion: "reduce",
		serviceWorkers: "block",
		proxy: escapes.proxy,
	});
	context.setDefaultTimeout(SCENE_TIMEOUT_MS);
	const guard = await guardNetwork({ context, origin, escapes });
	await serveLocalMedia({ context, guard });
	return { context, guard, origin, platform };
}
