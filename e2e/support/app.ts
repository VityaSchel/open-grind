import type { CDPSession, Locator, Page, test } from "@playwright/test";

export const DEMO_CONVERSATION_ID = "100001:123456000";
export const DEMO_CONVERSATION = `/chat/${DEMO_CONVERSATION_ID}`;
export const MESSAGE_ROW = '[role="article"]';
// only an incoming row pads its end, and only incoming rows swipe rightward
export const INCOMING_ROW = `${MESSAGE_ROW}.pe-3`;
export const DEMO_GEOHASH = "u33dc0cpgp00";
export const FIRST_ROUTE_COMPILE_MS = 120_000;
export const CLASSIC_SCROLLBARS: Parameters<typeof test.use>[0] = {
	launchOptions: ({ launchOptions }, use) =>
		use({ ...launchOptions, ignoreDefaultArgs: ["--hide-scrollbars"] }),
};

export const backLink = (page: Page) =>
	page.getByRole("link", { name: "Back", exact: true });
export const meTab = (page: Page) =>
	page.getByRole("link", { name: "Me", exact: true });

export const pathname = (page: Page) => page.evaluate(() => location.pathname);
export const historyDepth = (page: Page) => page.evaluate(() => history.length);

export function afterTwoFrames(page: Page): Promise<void> {
	return page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() =>
					requestAnimationFrame(() => resolve()),
				),
			),
	);
}

declare global {
	interface Window {
		__capturedInvokes?: Record<string, unknown[]>;
		__emitTauriEvent?: (event: string, payload: unknown) => void;
		__rendered?: Record<string, boolean>;
	}
}

export async function watchRendered(
	page: Page,
	selector: string,
): Promise<() => Promise<boolean>> {
	await page.evaluate((selector) => {
		const rendered = (window.__rendered ??= {});
		rendered[selector] = false;
		new MutationObserver((records) => {
			const added = records.flatMap((record) => [...record.addedNodes]);
			if (
				added.some(
					(node) =>
						node instanceof Element &&
						(node.matches(selector) ||
							node.querySelector(selector) !== null),
				)
			) {
				rendered[selector] = true;
			}
		}).observe(document.body, { subtree: true, childList: true });
	}, selector);
	return () =>
		page.evaluate(
			(selector) => window.__rendered?.[selector] === true,
			selector,
		);
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

export function emitMessageSent(page: Page, payload: unknown): Promise<void> {
	return page.evaluate(
		(message) =>
			window.__emitTauriEvent?.("grindr:chat_v1_message_sent", {
				type: "chat.v1.message_sent",
				notificationId: null,
				ref: null,
				payload: message,
			}),
		payload,
	);
}

type MessageEnvelope = {
	messageId: string;
	conversationId: string;
	senderId: number;
	timestamp: number;
};

export function expiringImageMessage({
	envelope,
	spent = false,
}: {
	envelope: MessageEnvelope;
	spent?: boolean;
}) {
	return {
		type: "ExpiringImage",
		body: {
			mediaId: 910_900,
			width: 600,
			height: 800,
			url: spent
				? null
				: "https://picsum.photos/seed/expiring-image/600/800",
			duration: 10_000,
			viewsRemaining: spent ? 0 : 1,
			expiresAt: envelope.timestamp + 86_400_000,
			viewed: spent,
		},
		...envelope,
	};
}

export function expiringVideoMessage({
	envelope,
}: {
	envelope: MessageEnvelope;
}) {
	return {
		type: "Video",
		body: {
			mediaId: 900_001,
			url: "https://cdns.grindr.com/videos/chat/clip.mp4",
			contentType: "video/mp4",
			length: 8000,
			maxViews: 2,
			viewsRemaining: 2,
			looping: false,
		},
		...envelope,
	};
}

export async function captureInvokes(page: Page, command: string) {
	await page.evaluate((watched) => {
		if (!window.__capturedInvokes) {
			const captured: Record<string, unknown[]> = {};
			window.__capturedInvokes = captured;
			const internals = (
				window as unknown as { __TAURI_INTERNALS__: TauriInternals }
			).__TAURI_INTERNALS__;
			const passThrough = internals.invoke;
			internals.invoke = (cmd, args, opts) => {
				captured[cmd]?.push(args ?? null);
				return passThrough(cmd, args, opts);
			};
		}
		window.__capturedInvokes[watched] = [];
	}, command);
	return () =>
		page.evaluate(
			(watched) => window.__capturedInvokes?.[watched] ?? [],
			command,
		);
}

export async function captureOpenedUrls(page: Page) {
	const opened = await captureInvokes(page, "plugin:opener|open_url");
	return async () =>
		(await opened()).map((args) => (args as { url: string }).url);
}

export function flownIn(page: Page, button: string): Promise<unknown> {
	return page.evaluate(
		(selector) =>
			Promise.all(
				(
					document
						.querySelector(selector)
						?.parentElement?.getAnimations() ?? []
				).map((animation) => animation.finished.catch(() => undefined)),
			),
		button,
	);
}

export const GRID_READY_SELECTOR = '[aria-label="All filters"]';

export async function ensureGridLocation(page: Page): Promise<void> {
	const allFilters = page.locator(GRID_READY_SELECTOR);
	if ((await allFilters.count()) === 0) {
		// tinykeys reads navigator.platform, so the CI runner wants Control
		await runPaletteCommand(page, `@${DEMO_GEOHASH}`);
	}
	await allFilters.waitFor({ timeout: 60_000 });
}

export async function runPaletteCommand(
	page: Page,
	command: string,
): Promise<void> {
	await page.keyboard.press("ControlOrMeta+k");
	const palette = page.getByRole("combobox");
	await palette.waitFor();
	await palette.fill(command);
	await page
		.locator(
			`[role="option"][data-value="${command}"][aria-selected="true"]`,
		)
		.waitFor();
	await page.keyboard.press("Enter");
}

// The platform decides which wheel path the app takes: "macos" (the
// default) runs the gesture-phase bridge, anything else the scroller rail.
export async function installTauriShim(
	page: Page,
	{ platform = "macos" } = {},
): Promise<void> {
	await page.addInitScript((platformName: string) => {
		interface AppDataArgs {
			file?: string;
			content?: string;
		}

		const files = new Map<string, Uint8Array>();

		const invoke = (cmd: string, args?: unknown): unknown => {
			const { file = "", content = "" } = (args ?? {}) as AppDataArgs;

			if (cmd.startsWith("plugin:event|")) return null;
			if (cmd === "read_app_data") {
				return files.get(file)?.slice().buffer ?? null;
			}
			if (cmd === "write_app_data") {
				files.set(
					file,
					Uint8Array.from(atob(content), (char) =>
						char.charCodeAt(0),
					),
				);
				return null;
			}
			if (cmd === "remove_app_data") {
				files.delete(file);
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
				invoke: (cmd: string, args?: unknown) =>
					Promise.resolve(invoke(cmd, args)),
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

export async function hoverPen({
	page,
	target,
}: {
	page: Page;
	target: Locator;
}): Promise<void> {
	const box = await target.boundingBox();
	if (box === null) throw new Error("The pen target has no box");
	const pen = await page.context().newCDPSession(page);
	await pen.send("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: box.x + box.width / 2,
		y: box.y + box.height / 2,
		pointerType: "pen",
		buttons: 0,
	});
	await pen.detach();
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
