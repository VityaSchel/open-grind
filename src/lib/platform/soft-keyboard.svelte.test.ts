import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { NativeInsets } from "./native-insets";
import type { SupportedPlatform } from "./os";

const remeasureScreenChrome = vi.hoisted(() => vi.fn());

vi.mock("#lib/util/screen-chrome.svelte.ts", () => ({ remeasureScreenChrome }));

const ROOT_ATTRIBUTE = "data-keyboard-shrinks-page";

const KEYBOARD_HIDDEN: NativeInsets = {
	top: 62,
	bottom: 34,
	left: 0,
	right: 0,
	ime: false,
};

const KEYBOARD_SHOWN: NativeInsets = {
	...KEYBOARD_HIDDEN,
	bottom: 0,
	ime: true,
};

const SCREEN_HEIGHT = 874;
const KEYBOARD_HEIGHT = 328;

let uninstallNativeInsets: (() => void) | undefined;

async function loadSoftKeyboard() {
	vi.resetModules();
	return await import("./soft-keyboard.svelte");
}

async function loadFedByNativeInsets() {
	const softKeyboard = await loadSoftKeyboard();
	const { installNativeInsets } = await import("./native-insets");
	uninstallNativeInsets = installNativeInsets();
	return softKeyboard;
}

function shrunk(): boolean {
	return document.documentElement.hasAttribute(ROOT_ATTRIBUTE);
}

function safeAreaBottom(): string {
	return document.documentElement.style.getPropertyValue(
		"--safe-area-bottom",
	);
}

function resizeWindow(height: number) {
	vi.stubGlobal("innerHeight", height);
	window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
	uninstallNativeInsets?.();
	uninstallNativeInsets = undefined;
	vi.unstubAllGlobals();
	delete window.__AndroidInsets;
	delete window.__iosInsets;
	remeasureScreenChrome.mockClear();
	resetPlatform();
	document.documentElement.removeAttribute(ROOT_ATTRIBUTE);
	document.documentElement.style.removeProperty("--safe-area-bottom");
});

describe.each([
	{ platform: "android", shrinksAtPush: false },
	{ platform: "ios", shrinksAtPush: true },
] satisfies { platform: SupportedPlatform; shrinksAtPush: boolean }[])(
	"fed by the native insets on $platform",
	({ platform, shrinksAtPush }) => {
		beforeEach(() => {
			runningOn(platform);
			vi.stubGlobal("innerHeight", SCREEN_HEIGHT);
			window.__AndroidInsets = {
				top: () => KEYBOARD_HIDDEN.top,
				bottom: () => KEYBOARD_HIDDEN.bottom,
				left: () => KEYBOARD_HIDDEN.left,
				right: () => KEYBOARD_HIDDEN.right,
				imeVisible: () => KEYBOARD_HIDDEN.ime,
			};
			window.__iosInsets = KEYBOARD_HIDDEN;
		});

		it(
			shrinksAtPush
				? "shrinks the page as soon as the keyboard opens, before the window resizes for it"
				: "keeps the page whole until the window resizes for the opening keyboard",
			async () => {
				const { softKeyboardShrinksPage } =
					await loadFedByNativeInsets();

				window.__reapplyInsets(KEYBOARD_SHOWN);
				expect(softKeyboardShrinksPage()).toBe(shrinksAtPush);
				expect(safeAreaBottom()).toBe("34px");

				resizeWindow(SCREEN_HEIGHT - KEYBOARD_HEIGHT);
				expect(softKeyboardShrinksPage()).toBe(true);
				expect(safeAreaBottom()).toBe("0px");
			},
		);

		it("grows the page back only once the window resizes after the keyboard closes", async () => {
			const { softKeyboardShrinksPage } = await loadFedByNativeInsets();
			window.__reapplyInsets(KEYBOARD_SHOWN);
			resizeWindow(SCREEN_HEIGHT - KEYBOARD_HEIGHT);

			window.__reapplyInsets(KEYBOARD_HIDDEN);
			expect(softKeyboardShrinksPage()).toBe(true);

			resizeWindow(SCREEN_HEIGHT);
			expect(softKeyboardShrinksPage()).toBe(false);
		});

		it("grows the page back when the keyboard closes again before the window resized", async () => {
			const { softKeyboardShrinksPage } = await loadFedByNativeInsets();

			window.__reapplyInsets(KEYBOARD_SHOWN);
			window.__reapplyInsets(KEYBOARD_HIDDEN);
			resizeWindow(SCREEN_HEIGHT);

			expect(softKeyboardShrinksPage()).toBe(false);
		});

		it("keeps the page shrunk while focus moves to another field under the same keyboard", async () => {
			const { softKeyboardShrinksPage } = await loadFedByNativeInsets();
			window.__reapplyInsets(KEYBOARD_SHOWN);
			resizeWindow(SCREEN_HEIGHT - KEYBOARD_HEIGHT);

			window.__reapplyInsets({ ...KEYBOARD_SHOWN });
			resizeWindow(SCREEN_HEIGHT - KEYBOARD_HEIGHT);

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

	it("tells its readers when the page shrinks and grows back", async () => {
		runningOn("ios");
		const { noteSoftKeyboardOpen, softKeyboardShrinksPage } =
			await loadSoftKeyboard();
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
