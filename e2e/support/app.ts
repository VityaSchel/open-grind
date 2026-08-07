import type { CDPSession, Page } from "@playwright/test";

export const DEMO_CONVERSATION = "/chat/100001:123456000";
export const DEMO_GEOHASH = "u33dc0cpgp00";

export async function ensureGridLocation(page: Page): Promise<void> {
	const allFilters = page.locator('[aria-label="All filters"]');
	if ((await allFilters.count()) === 0) {
		await page.keyboard.press("Meta+k");
		const palette = page.getByRole("combobox");
		await palette.waitFor();
		await palette.fill(`@${DEMO_GEOHASH}`);
		await page
			.locator(`[role="option"][data-value="@${DEMO_GEOHASH}"]`)
			.waitFor();
		await page.keyboard.press("Enter");
	}
	await allFilters.waitFor({ timeout: 60_000 });
}

export async function installTauriShim(page: Page): Promise<void> {
	await page.addInitScript(() => {
		interface FsArgs {
			path?: string;
			oldPath?: string;
			newPath?: string;
		}
		interface InvokeOptions {
			headers?: Record<string, string>;
		}

		const files = new Map<string, Uint8Array>();

		const invoke = (
			cmd: string,
			args?: unknown,
			opts?: unknown,
		): unknown => {
			const fs = (args ?? {}) as FsArgs;
			const headers = ((opts ?? {}) as InvokeOptions).headers ?? {};

			if (cmd === "plugin:path|resolve_directory") return "/appdata";
			if (cmd.startsWith("plugin:event|")) return null;
			if (cmd === "plugin:fs|exists") return files.has(fs.path ?? "");
			if (cmd === "plugin:fs|read_file") {
				const data = files.get(fs.path ?? "");
				if (!data) throw new Error("ENOENT");
				return data;
			}
			if (cmd === "plugin:fs|mkdir") return null;
			if (cmd === "plugin:fs|rename") {
				const data = files.get(fs.oldPath ?? "");
				if (data) files.set(fs.newPath ?? "", data);
				files.delete(fs.oldPath ?? "");
				return null;
			}
			if (cmd === "plugin:fs|write_file") {
				const path = decodeURIComponent(headers.path ?? fs.path ?? "");
				files.set(
					path,
					args instanceof Uint8Array ? args : new Uint8Array(),
				);
				return null;
			}
			return null;
		};

		Object.assign(window, {
			__TAURI_OS_PLUGIN_INTERNALS__: {
				eol: "\n",
				platform: "macos",
				version: "15.0",
				family: "unix",
				os_type: "macos",
				arch: "aarch64",
				exe_extension: "",
			},
			__TAURI_INTERNALS__: {
				convertFileSrc: (filePath: string, protocol = "asset") =>
					`${protocol}://localhost/${encodeURIComponent(filePath)}`,
				transformCallback: () => Math.floor(Math.random() * 1e9),
				metadata: {
					currentWindow: { label: "main" },
					currentWebview: { label: "main" },
				},
				invoke: (cmd: string, args?: unknown, opts?: unknown) =>
					Promise.resolve(invoke(cmd, args, opts)),
			},
		});
	});
}

export class TrustedTouch {
	constructor(private readonly cdp: CDPSession) {}

	static async attach(page: Page): Promise<TrustedTouch> {
		return new TrustedTouch(await page.context().newCDPSession(page));
	}

	private send(type: string, points: { x: number; y: number }[]) {
		return this.cdp.send("Input.dispatchTouchEvent", {
			type,
			touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: 1 })),
		} as never);
	}

	start(x: number, y: number) {
		return this.send("touchStart", [{ x, y }]);
	}

	move(x: number, y: number) {
		return this.send("touchMove", [{ x, y }]);
	}

	end() {
		return this.send("touchEnd", []);
	}

	async drag(
		page: Page,
		from: { x: number; y: number },
		to: { x: number; y: number },
		{ steps = 20, holdMs = 16, release = true } = {},
	) {
		await this.start(from.x, from.y);
		for (let i = 1; i <= steps; i++) {
			await this.move(
				from.x + ((to.x - from.x) * i) / steps,
				from.y + ((to.y - from.y) * i) / steps,
			);
			await page.waitForTimeout(holdMs);
		}
		if (release) await this.end();
	}
}

export async function wheel(
	page: Page,
	at: { x: number; y: number },
	deltaY: number,
	{ steps = 1, gapMs = 16 } = {},
) {
	await page.mouse.move(at.x, at.y);
	for (let i = 0; i < steps; i++) {
		await page.mouse.wheel(0, deltaY);
		await page.waitForTimeout(gapMs);
	}
}
