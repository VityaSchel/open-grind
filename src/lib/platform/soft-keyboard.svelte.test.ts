import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runningOn } from "#lib/test/platform.ts";
import type { NativeInsets } from "./native-insets";
import {
	androidBridge,
	IOS_INSETS,
	IOS_KEYBOARD_SHOWN,
	KEYBOARD_HIDDEN,
	KEYBOARD_SHOWN,
	loadNativeInsets,
	resetNativeInsets,
	resizeViewport,
} from "./native-insets-test-helpers";
import type { SupportedPlatform } from "./os";
import * as softKeyboardOnTestRuntime from "./soft-keyboard.svelte";

const remeasureScreenChrome = vi.hoisted(() => vi.fn());

vi.mock("#lib/util/screen-chrome.svelte.ts", () => ({ remeasureScreenChrome }));

const ROOT_ATTRIBUTE = "data-keyboard-shrinks-page";

const SCREEN_HEIGHT = 874;
const KEYBOARD_HEIGHT = 328;

async function loadSoftKeyboard() {
	vi.resetModules();
	return await import("./soft-keyboard.svelte");
}

async function loadFedByNativeInsets() {
	const { installNativeInsets } = await loadNativeInsets();
	installNativeInsets();
	return await import("./soft-keyboard.svelte");
}

function shrunk(): boolean {
	return document.documentElement.hasAttribute(ROOT_ATTRIBUTE);
}

function safeAreaBottom(): string {
	return document.documentElement.style.getPropertyValue(
		"--safe-area-bottom",
	);
}

afterEach(() => {
	resetNativeInsets();
	remeasureScreenChrome.mockClear();
	document.documentElement.removeAttribute(ROOT_ATTRIBUTE);
});

describe.each([
	{
		platform: "android",
		closed: KEYBOARD_HIDDEN,
		open: KEYBOARD_SHOWN,
		shrinksAtPush: false,
	},
	{
		platform: "ios",
		closed: IOS_INSETS,
		open: IOS_KEYBOARD_SHOWN,
		shrinksAtPush: true,
	},
] satisfies {
	platform: SupportedPlatform;
	closed: NativeInsets;
	open: NativeInsets;
	shrinksAtPush: boolean;
}[])(
	"fed by the native insets on $platform",
	({ platform, closed, open, shrinksAtPush }) => {
		beforeEach(() => {
			runningOn(platform);
			vi.stubGlobal("innerHeight", SCREEN_HEIGHT);
			window.__AndroidInsets = androidBridge(closed);
			window.__iosInsets = closed;
		});

		it(
			shrinksAtPush
				? "shrinks the page as soon as the keyboard opens, before the window resizes for it"
				: "keeps the page whole until the window resizes for the opening keyboard",
			async () => {
				const { softKeyboardShrinksPage } =
					await loadFedByNativeInsets();

				window.__reapplyInsets(open);
				expect(softKeyboardShrinksPage()).toBe(shrinksAtPush);
				expect(safeAreaBottom()).toBe(`${closed.bottom}px`);

				resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT);
				expect(softKeyboardShrinksPage()).toBe(true);
				expect(safeAreaBottom()).toBe("0px");
			},
		);

		it("grows the page back only once the window resizes after the keyboard closes", async () => {
			const { softKeyboardShrinksPage } = await loadFedByNativeInsets();
			window.__reapplyInsets(open);
			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT);

			window.__reapplyInsets(closed);
			expect(softKeyboardShrinksPage()).toBe(true);

			resizeViewport(SCREEN_HEIGHT);
			expect(softKeyboardShrinksPage()).toBe(false);
		});

		it("grows the page back when the keyboard closes again before the window resized", async () => {
			const { softKeyboardShrinksPage } = await loadFedByNativeInsets();

			window.__reapplyInsets(open);
			window.__reapplyInsets(closed);
			resizeViewport(SCREEN_HEIGHT);

			expect(softKeyboardShrinksPage()).toBe(false);
		});

		it("keeps the page shrunk while focus moves to another field under the same keyboard", async () => {
			const { softKeyboardShrinksPage } = await loadFedByNativeInsets();
			window.__reapplyInsets(open);
			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT);

			window.__reapplyInsets({ ...open });
			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT);

			expect(softKeyboardShrinksPage()).toBe(true);
		});
	},
);

describe.each([
	{ platform: "android", whileOpen: true, whileFollowed: true },
	{ platform: "ios", whileOpen: true, whileFollowed: false },
	{ platform: "linux", whileOpen: false, whileFollowed: false },
	{ platform: "macos", whileOpen: false, whileFollowed: false },
	{ platform: "windows", whileOpen: false, whileFollowed: false },
] satisfies {
	platform: SupportedPlatform;
	whileOpen: boolean;
	whileFollowed: boolean;
}[])("on $platform", ({ platform, whileOpen, whileFollowed }) => {
	it(`${whileOpen ? "shrinks" : "never shrinks"} the page while the keyboard is open`, async () => {
		runningOn(platform);
		const { noteSoftKeyboardOpen, softKeyboardShrinksPage } =
			await loadSoftKeyboard();
		expect(softKeyboardShrinksPage()).toBe(false);

		noteSoftKeyboardOpen(true);

		expect(softKeyboardShrinksPage()).toBe(whileOpen);
	});

	it(`${whileFollowed ? "shrinks" : "keeps"} the page while it follows the keyboard`, async () => {
		runningOn(platform);
		const {
			noteSoftKeyboardOpen,
			notePageFollowsSoftKeyboard,
			softKeyboardShrinksPage,
		} = await loadSoftKeyboard();

		notePageFollowsSoftKeyboard(true);
		noteSoftKeyboardOpen(true);

		expect(softKeyboardShrinksPage()).toBe(whileFollowed);
	});
});

describe("on ios", () => {
	it("shrinks the page once a field outside the follower takes the keyboard", async () => {
		runningOn("ios");
		const {
			noteSoftKeyboardOpen,
			notePageFollowsSoftKeyboard,
			softKeyboardShrinksPage,
		} = await loadSoftKeyboard();
		notePageFollowsSoftKeyboard(true);
		noteSoftKeyboardOpen(true);

		notePageFollowsSoftKeyboard(false);

		expect(softKeyboardShrinksPage()).toBe(true);
	});

	it("tells its readers when the page shrinks and grows back", () => {
		runningOn("ios");
		const { noteSoftKeyboardOpen, softKeyboardShrinksPage } =
			softKeyboardOnTestRuntime;
		const seen: boolean[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				seen.push(softKeyboardShrinksPage());
			});
		});
		flushSync();

		noteSoftKeyboardOpen(true);
		flushSync();
		noteSoftKeyboardOpen(true);
		flushSync();
		noteSoftKeyboardOpen(false);
		flushSync();
		stop();

		expect(seen).toEqual([false, true, false]);
	});
});

describe("the root marks a shrunk page", () => {
	it("while the keyboard shrinks it and remeasures the screen chrome on each change", async () => {
		runningOn("android");
		const { applySoftKeyboardLayout, noteSoftKeyboardOpen } =
			await loadSoftKeyboard();

		applySoftKeyboardLayout();
		expect(shrunk()).toBe(false);
		expect(remeasureScreenChrome).not.toHaveBeenCalled();

		noteSoftKeyboardOpen(true);
		applySoftKeyboardLayout();
		expect(shrunk()).toBe(true);
		expect(remeasureScreenChrome).toHaveBeenCalledOnce();

		applySoftKeyboardLayout();
		expect(remeasureScreenChrome).toHaveBeenCalledOnce();

		noteSoftKeyboardOpen(false);
		applySoftKeyboardLayout();
		expect(shrunk()).toBe(false);
		expect(remeasureScreenChrome).toHaveBeenCalledTimes(2);
	});

	it.each(["linux", "macos", "windows"] as const)(
		"never on %s",
		async (platform) => {
			runningOn(platform);
			const { applySoftKeyboardLayout, noteSoftKeyboardOpen } =
				await loadSoftKeyboard();

			noteSoftKeyboardOpen(true);
			applySoftKeyboardLayout();

			expect(shrunk()).toBe(false);
			expect(remeasureScreenChrome).not.toHaveBeenCalled();
		},
	);
});
