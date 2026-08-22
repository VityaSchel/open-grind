import type { CDPSession, Page } from "@playwright/test";

export const DEMO_CONVERSATION = "/chat/100001:123456000";
export const DEMO_GEOHASH = "u33dc0cpgp00";

declare global {
	interface Window {
		__emitTauriEvent?: (event: string, payload: unknown) => void;
	}
}

type TauriInternals = {
	transformCallback: (callback: unknown) => number;
	invoke: (cmd: string, args?: unknown, opts?: unknown) => Promise<unknown>;
};

// The demo websocket seeds nothing after load, so tests deliver late events
// over the same Tauri event channel the app already listens on.
export async function installEventInjection(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const internals = (
			window as unknown as { __TAURI_INTERNALS__: TauriInternals }
		).__TAURI_INTERNALS__;
		const handlers = new Map<number, (event: unknown) => void>();
		const listenersByEvent = new Map<string, number[]>();
		let nextHandlerId = 1;

		internals.transformCallback = (callback: unknown) => {
			const id = nextHandlerId++;
			handlers.set(id, callback as (event: unknown) => void);
			return id;
		};

		const passThrough = internals.invoke;
		internals.invoke = (cmd: string, args?: unknown, opts?: unknown) => {
			if (cmd !== "plugin:event|listen")
				return passThrough(cmd, args, opts);
			const { event, handler } = (args ?? {}) as {
				event: string;
				handler: number;
			};
			listenersByEvent.set(event, [
				...(listenersByEvent.get(event) ?? []),
				handler,
			]);
			return Promise.resolve(handler);
		};

		window.__emitTauriEvent = (event: string, payload: unknown) => {
			for (const id of listenersByEvent.get(event) ?? [])
				handlers.get(id)?.({ event, id, payload });
		};
	});
}

export const GRID_READY_SELECTOR = '[aria-label="All filters"]';

export async function ensureGridLocation(page: Page): Promise<void> {
	const allFilters = page.locator(GRID_READY_SELECTOR);
	if ((await allFilters.count()) === 0) {
		// tinykeys reads navigator.platform, so the CI runner wants Control
		await page.keyboard.press("ControlOrMeta+k");
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

// The platform decides which wheel path the app takes: "macos" (the
// default) runs the gesture-phase bridge, anything else the scroller rail.
export async function installTauriShim(
	page: Page,
	{ platform = "macos" } = {},
): Promise<void> {
	await page.addInitScript((platformName: string) => {
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
			// the real runtime defines this; isTauri() reads it, and the
			// wheel-input mode hangs off isTauri()
			isTauri: true,
			__TAURI_OS_PLUGIN_INTERNALS__: {
				eol: "\n",
				platform: platformName,
				version: "15.0",
				family: "unix",
				os_type: platformName,
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
	}, platform);
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

// One continuous gesture stream with a single lift, the shape a real trackpad
// sends; discrete mouse.wheel calls each carry their own instant scrollend.
export async function trackpadSwipe(
	page: Page,
	at: { x: number; y: number },
	{ xDistance = 0, yDistance = 0, speed = 400 } = {},
) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Input.synthesizeScrollGesture", {
		x: at.x,
		y: at.y,
		xDistance,
		yDistance,
		speed,
		preventFling: true,
		gestureSourceType: "mouse",
	} as never);
	await cdp.detach();
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
