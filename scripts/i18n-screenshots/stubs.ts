import type { Page } from "@playwright/test";

import { installGeolocationShim } from "../../e2e/support/geolocation";
import type { ScreenshotScene } from "../../src/lib/demo/screenshot-scene";

export const NEUTRAL_COORDINATES = { latitude: 10, longitude: -35 };
export const NEUTRAL_GEOHASH = "e1z0gs3y0zh7";

const APP_VERSION = "1.2.0";
const NEXT_CHECK_AT = Date.parse("2026-07-22T13:12:00Z");

const nativeAnswers = {
	"plugin:app|version": APP_VERSION,
	regional_settings: {
		locale: "en-US",
		numberLocale: "en-US",
		hourCycle: "h12",
		twoDigitHour: false,
		dateOrder: "mdy",
		decimalSeparator: ".",
		groupSeparator: ",",
		numberingSystem: "latn",
		firstDayOfWeek: 7,
		measurementSystem: "metric",
	},
	updater_capability: {
		state: "supported",
		detail: { payloadSuffix: "universal-release.apk", canInstallNow: true },
	},
	updater_settings: { autoCheck: true, nextCheckAt: NEXT_CHECK_AT },
	updater_check: {
		available: false,
		currentVersion: APP_VERSION,
		release: null,
	},
	updater_progress: null,
	updater_readiness: { state: "nothingStaged" },
	updater_install_pending: false,
	updater_installed_version: null,
	updater_take_install_outcome: null,
};

export async function installNativeStubs(page: Page): Promise<void> {
	await page.addInitScript(
		({ answers, nextCheckAt }) => {
			const internals = (
				window as unknown as {
					__TAURI_INTERNALS__: {
						invoke: (
							cmd: string,
							args?: unknown,
							opts?: unknown,
						) => Promise<unknown>;
					};
				}
			).__TAURI_INTERNALS__;
			const passThrough = internals.invoke;
			internals.invoke = (cmd, args, opts) => {
				if (cmd === "updater_set_auto_check") {
					const { enabled } = args as { enabled: boolean };
					return Promise.resolve({ autoCheck: enabled, nextCheckAt });
				}
				if (Object.hasOwn(answers, cmd)) {
					return Promise.resolve(answers[cmd]);
				}
				return passThrough(cmd, args, opts);
			};
		},
		{
			answers: nativeAnswers as Record<string, unknown>,
			nextCheckAt: NEXT_CHECK_AT,
		},
	);
}

export async function seedScene({
	page,
	scene,
}: {
	page: Page;
	scene: Partial<ScreenshotScene>;
}): Promise<void> {
	await page.addInitScript((seeded) => {
		window.__openGrindScreenshotScene = seeded;
	}, scene);
}

export function installNeutralGeolocation(page: Page): Promise<void> {
	return installGeolocationShim(page, { coords: NEUTRAL_COORDINATES });
}
