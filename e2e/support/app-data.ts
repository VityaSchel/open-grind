import { decode } from "@msgpack/msgpack";
import type { Page } from "@playwright/test";

const APP_DATA_PREFIX = "e2e:appdata:";
const FS_DELAY_KEY = "e2e:fsdelay";

export async function installPersistentAppData(page: Page): Promise<void> {
	await page.addInitScript(
		([KEY, DELAY_KEY]) => {
			const decode = (value: string) =>
				Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
			const encode = (bytes: Uint8Array) =>
				btoa(
					Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
						"",
					),
				);

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
				const fs = (args ?? {}) as {
					path?: string;
					oldPath?: string;
					newPath?: string;
				};
				const headerPath = (
					(opts ?? {}) as { headers?: Record<string, string> }
				).headers?.path;

				if (cmd === "plugin:fs|exists")
					return localStorage.getItem(KEY + fs.path) !== null;
				if (cmd === "plugin:fs|read_file") {
					const stored = localStorage.getItem(KEY + fs.path);
					if (stored === null) throw new Error("ENOENT");
					return decode(stored);
				}
				if (cmd === "plugin:fs|write_file") {
					return delayed(() => {
						localStorage.setItem(
							KEY +
								decodeURIComponent(headerPath ?? fs.path ?? ""),
							encode(
								args instanceof Uint8Array
									? args
									: new Uint8Array(),
							),
						);
						return null;
					});
				}
				if (cmd === "plugin:fs|rename") {
					return delayed(() => {
						const stored = localStorage.getItem(KEY + fs.oldPath);
						if (stored !== null)
							localStorage.setItem(KEY + fs.newPath, stored);
						localStorage.removeItem(KEY + fs.oldPath);
						return null;
					});
				}
				return passThrough(cmd, args, opts);
			};
		},
		[APP_DATA_PREFIX, FS_DELAY_KEY] as const,
	);
}

export async function storedPreferences(
	page: Page,
): Promise<Record<string, unknown> | null> {
	const raw = await page.evaluate(
		(key) => localStorage.getItem(key),
		`${APP_DATA_PREFIX}preferences.data`,
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
		[FS_DELAY_KEY, ms] as const,
	);
}
