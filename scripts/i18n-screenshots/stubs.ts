import type { Page } from "@playwright/test";

import { installGeolocationShim } from "../../e2e/support/geolocation";
import type { ScreenshotScene } from "../../src/lib/demo/screenshot-scene";

export const NEUTRAL_COORDINATES = { latitude: 10, longitude: -35 };
export const NEUTRAL_GEOHASH = "e1z0gs3y0zh7";

const NAVIGATOR_PLATFORMS = {
	android: "Linux armv81",
	ios: "iPhone",
	linux: "Linux x86_64",
	macos: "MacIntel",
	windows: "Win32",
} as const;

type ShimPlatform = keyof typeof NAVIGATOR_PLATFORMS;

const APP_VERSION = "1.2.0";
const NEXT_CHECK_AT = Date.parse("2026-07-22T13:12:00Z");

export type NativeOverride =
	| { answer: unknown }
	| { reject: unknown }
	| { pending: true }
	| { sequence: NativeOverride[] };

export type NativeOverrides = Record<string, NativeOverride>;

declare global {
	interface Window {
		__openGrindNativeOverrides?: NativeOverrides;
	}
}

const nativeAnswers: Record<string, unknown> = {
	"plugin:app|version": APP_VERSION,
	app_languages: { tier: "none", app: null, system: ["en-US"] },
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
	push_shown_conversations: [],
};

function answered(answers: Record<string, unknown>): NativeOverrides {
	return Object.fromEntries(
		Object.entries(answers).map(([command, answer]) => [
			command,
			{ answer },
		]),
	);
}

export async function installNativeStubs({
	page,
	overrides = {},
}: {
	page: Page;
	overrides?: NativeOverrides;
}): Promise<void> {
	await page.addInitScript(
		({ seeded, nextCheckAt }) => {
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
			const events = window as unknown as {
				__TAURI_EVENT_PLUGIN_INTERNALS__?: {
					unregisterListener: () => void;
				};
			};
			events.__TAURI_EVENT_PLUGIN_INTERNALS__ ??= {
				unregisterListener: () => {},
			};
			const passThrough = internals.invoke;
			const calls = new Map<string, number>();
			const table = (window.__openGrindNativeOverrides = seeded);
			const respond = ({
				command,
				override,
			}: {
				command: string;
				override: NativeOverride;
			}): Promise<unknown> => {
				if ("sequence" in override) {
					const index = calls.get(command) ?? 0;
					calls.set(command, index + 1);
					const step = override.sequence.at(
						Math.min(index, override.sequence.length - 1),
					);
					return respond({
						command,
						override: step ?? { answer: null },
					});
				}
				if ("reject" in override)
					return Promise.reject(override.reject);
				if ("pending" in override) return new Promise(() => {});
				return Promise.resolve(override.answer);
			};
			internals.invoke = (cmd, args, opts) => {
				const override = table[cmd];
				if (override !== undefined)
					return respond({ command: cmd, override });
				if (cmd === "updater_set_auto_check") {
					const { enabled } = args as { enabled: boolean };
					return Promise.resolve({ autoCheck: enabled, nextCheckAt });
				}
				return passThrough(cmd, args, opts);
			};
		},
		{
			seeded: { ...answered(nativeAnswers), ...overrides },
			nextCheckAt: NEXT_CHECK_AT,
		},
	);
}

export async function overrideNative({
	page,
	overrides,
}: {
	page: Page;
	overrides: NativeOverrides;
}): Promise<void> {
	await page.evaluate((changed) => {
		Object.assign(window.__openGrindNativeOverrides ?? {}, changed);
	}, overrides);
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

export async function pinNavigatorPlatform({
	page,
	platform,
}: {
	page: Page;
	platform: ShimPlatform;
}): Promise<void> {
	await page.addInitScript((pinned) => {
		Object.defineProperty(Navigator.prototype, "platform", {
			get: () => pinned,
		});
	}, NAVIGATOR_PLATFORMS[platform]);
}

export function installNeutralGeolocation(page: Page): Promise<void> {
	return installGeolocationShim(page, { coords: NEUTRAL_COORDINATES });
}
