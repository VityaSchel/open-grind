import { decode } from "@msgpack/msgpack";
import type { Page } from "@playwright/test";

const APP_DATA_PREFIX = "e2e:appdata:";
const WRITE_DELAY_KEY = "e2e:appdata-write-delay";

export async function installPersistentAppData(page: Page): Promise<void> {
	await page.addInitScript(
		([KEY, DELAY_KEY]) => {
			const writeDelayMs = () =>
				Number(localStorage.getItem(DELAY_KEY) ?? "0");
			const delayed = <T>(work: () => T): T | Promise<T> => {
				const ms = writeDelayMs();
				if (ms === 0) return work();
				return new Promise((resolve) =>
					setTimeout(() => resolve(work()), ms),
				);
			};

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
				const { file = "", content = "" } = (args ?? {}) as {
					file?: string;
					content?: string;
				};

				if (cmd === "read_app_data") {
					const stored = localStorage.getItem(KEY + file);
					if (stored === null) return null;
					return Uint8Array.from(atob(stored), (char) =>
						char.charCodeAt(0),
					).buffer;
				}
				if (cmd === "write_app_data") {
					return delayed(() => {
						localStorage.setItem(KEY + file, content);
						return null;
					});
				}
				if (cmd === "remove_app_data") {
					localStorage.removeItem(KEY + file);
					return null;
				}
				return passThrough(cmd, args, opts);
			};
		},
		[APP_DATA_PREFIX, WRITE_DELAY_KEY] as const,
	);
}

export async function storedPreferences(
	page: Page,
): Promise<Record<string, unknown> | null> {
	const raw = await page.evaluate(
		(key) => localStorage.getItem(key),
		`${APP_DATA_PREFIX}preferences`,
	);
	if (raw === null) return null;
	return decode(
		Uint8Array.from(atob(raw), (char) => char.charCodeAt(0)),
	) as Record<string, unknown>;
}

export async function setAppDataWriteDelay(
	page: Page,
	ms: number,
): Promise<void> {
	await page.evaluate(
		([key, value]) => {
			localStorage.setItem(key, String(value));
		},
		[WRITE_DELAY_KEY, ms] as const,
	);
}
