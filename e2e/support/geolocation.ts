import type { Page } from "@playwright/test";

type GeolocationState = {
	permission: "granted" | "denied" | "prompt" | "prompt-with-rationale";
	promptResult: "granted" | "denied";
	coords: { latitude: number; longitude: number };
	accuracy: number;
	delayMs: number;
	hang: boolean;
	fail: boolean;
	promptVisibilityCycle: boolean;
};

declare global {
	interface Window {
		__geolocationShim: {
			state: GeolocationState;
			calls: number;
			prompts: number;
		};
	}
}

const OVERRIDES_KEY = "e2e:geolocation";

const DEFAULT_STATE: GeolocationState = {
	permission: "granted",
	promptResult: "granted",
	coords: { latitude: 52.52, longitude: 13.405 },
	accuracy: 12,
	delayMs: 0,
	hang: false,
	fail: false,
	promptVisibilityCycle: false,
};

export async function installGeolocationShim(
	page: Page,
	state: Partial<GeolocationState> = {},
): Promise<void> {
	await page.addInitScript(
		([initial, overridesKey]) => {
			const shim = {
				state: {
					...initial,
					...(JSON.parse(
						localStorage.getItem(overridesKey) ?? "{}",
					) as Partial<GeolocationState>),
				},
				calls: 0,
				prompts: 0,
			};
			window.__geolocationShim = shim;

			let visibility: DocumentVisibilityState = "visible";
			const setVisibility = (next: DocumentVisibilityState) => {
				visibility = next;
				document.dispatchEvent(new Event("visibilitychange"));
			};
			(
				window as unknown as { __setVisibility: typeof setVisibility }
			).__setVisibility = setVisibility;
			Object.defineProperty(Document.prototype, "visibilityState", {
				get: () => visibility,
				configurable: true,
			});
			Object.defineProperty(Document.prototype, "hidden", {
				get: () => visibility === "hidden",
				configurable: true,
			});

			const internals = (
				window as unknown as {
					__TAURI_INTERNALS__: {
						invoke: (
							cmd: string,
							args?: unknown,
							opts?: unknown,
						) => unknown;
					};
				}
			).__TAURI_INTERNALS__;
			const passThrough = internals.invoke;

			internals.invoke = (cmd, args, opts) => {
				if (cmd === "plugin:geolocation|check_permissions")
					return Promise.resolve({
						location: shim.state.permission,
						coarseLocation: shim.state.permission,
					});
				if (cmd === "plugin:geolocation|request_permissions") {
					shim.prompts += 1;
					const answer = () => {
						shim.state.permission =
							shim.state.promptResult === "granted"
								? "granted"
								: "prompt-with-rationale";
						return {
							location: shim.state.promptResult,
							coarseLocation: shim.state.promptResult,
						};
					};
					if (!shim.state.promptVisibilityCycle)
						return Promise.resolve(answer());
					setVisibility("hidden");
					return new Promise((resolve) =>
						setTimeout(() => {
							setVisibility("visible");
							resolve(answer());
						}, 30),
					);
				}
				if (cmd === "plugin:geolocation|get_current_position") {
					shim.calls += 1;
					if (shim.state.hang) return new Promise(() => undefined);
					if (shim.state.fail)
						// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the Android plugin rejects with a bare string
						return Promise.reject("Location unavailable.");
					return new Promise((resolve) =>
						setTimeout(
							() =>
								resolve({
									timestamp: 0,
									coords: {
										...shim.state.coords,
										accuracy: shim.state.accuracy,
									},
								}),
							shim.state.delayMs,
						),
					);
				}
				return passThrough(cmd, args, opts);
			};
		},
		[{ ...DEFAULT_STATE, ...state }, OVERRIDES_KEY] as const,
	);
}

export async function setGeolocation(
	page: Page,
	state: Partial<GeolocationState>,
): Promise<void> {
	await page.evaluate(
		([next, overridesKey]) => {
			Object.assign(window.__geolocationShim.state, next);
			localStorage.setItem(
				overridesKey,
				JSON.stringify(window.__geolocationShim.state),
			);
		},
		[state, OVERRIDES_KEY] as const,
	);
}

export async function positionRequestCount(page: Page): Promise<number> {
	return await page.evaluate(() => window.__geolocationShim.calls);
}

export async function permissionPromptCount(page: Page): Promise<number> {
	return await page.evaluate(() => window.__geolocationShim.prompts);
}

export async function setPageVisibility(
	page: Page,
	state: "hidden" | "visible",
): Promise<void> {
	await page.evaluate((next) => {
		(
			window as unknown as {
				__setVisibility: (value: "hidden" | "visible") => void;
			}
		).__setVisibility(next);
	}, state);
}
