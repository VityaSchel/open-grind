import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runningOn } from "#lib/test/platform.ts";
import type { SafeAreaSide } from "#lib/util/safe-area.ts";
import type { NativeInsets } from "./native-insets";
import {
	androidBridge,
	FALLBACK_INSETS,
	IOS_INSETS,
	KEYBOARD_HIDDEN,
	KEYBOARD_SHOWN,
	loadNativeInsets,
	resetNativeInsets,
} from "./native-insets-test-helpers";
import type { SupportedPlatform } from "./os";

const remeasureScreenChrome = vi.hoisted(() => vi.fn());

vi.mock("#lib/util/screen-chrome.svelte.ts", () => ({
	remeasureScreenChrome,
	topChromeClearance: () => 0,
}));

const ANDROID_INSETS: NativeInsets = {
	top: 24,
	bottom: 48,
	left: 0,
	right: 0,
	ime: true,
};

const ENV_SAFE_AREA = {
	top: "env(safe-area-inset-top, 0px)",
	bottom: "env(safe-area-inset-bottom, 0px)",
	left: "env(safe-area-inset-left, 0px)",
	right: "env(safe-area-inset-right, 0px)",
};

function pxSafeArea({ top, bottom, left, right }: NativeInsets) {
	return {
		top: `${top}px`,
		bottom: `${bottom}px`,
		left: `${left}px`,
		right: `${right}px`,
	};
}

function safeArea(side: SafeAreaSide) {
	return document.documentElement.style.getPropertyValue(
		`--safe-area-${side}`,
	);
}

function safeAreas() {
	return {
		top: safeArea("top"),
		bottom: safeArea("bottom"),
		left: safeArea("left"),
		right: safeArea("right"),
	};
}

beforeEach(() => {
	remeasureScreenChrome.mockClear();
});

afterEach(resetNativeInsets);

describe("installNativeInsets on Android", () => {
	beforeEach(() => {
		runningOn("android");
	});

	it("writes the native bridge values as px without probing env()", async () => {
		const { installNativeInsets } = await loadNativeInsets();
		const appendChild = vi.spyOn(document.documentElement, "appendChild");
		const getComputedStyle = vi.spyOn(window, "getComputedStyle");
		window.__AndroidInsets = {
			top: () => 64,
			bottom: () => 47.5,
			left: () => 0,
			right: () => 0,
		};

		installNativeInsets();

		expect(safeArea("top")).toBe("64px");
		expect(safeArea("bottom")).toBe("47.5px");
		expect(safeArea("left")).toBe("0px");
		expect(safeArea("right")).toBe("0px");
		expect(appendChild).not.toHaveBeenCalled();
		expect(getComputedStyle).not.toHaveBeenCalled();
		expect(remeasureScreenChrome).toHaveBeenCalledOnce();
	});

	it("writes dispatched values over the bridge getters", async () => {
		const { installNativeInsets } = await loadNativeInsets();
		window.__AndroidInsets = androidBridge({
			top: 0,
			bottom: 0,
			left: 0,
			right: 0,
			ime: false,
		});
		installNativeInsets();

		window.__reapplyInsets(KEYBOARD_HIDDEN);

		expect(safeArea("top")).toBe("47.42857142857143px");
		expect(safeArea("bottom")).toBe("24px");
	});

	it("leaves the root style alone when the insets did not change", async () => {
		const { installNativeInsets } = await loadNativeInsets();
		window.__AndroidInsets = androidBridge(KEYBOARD_HIDDEN);
		installNativeInsets();
		const setProperty = vi.spyOn(
			document.documentElement.style,
			"setProperty",
		);

		window.__reapplyInsets({ ...KEYBOARD_HIDDEN });

		expect(setProperty).not.toHaveBeenCalled();
		expect(remeasureScreenChrome).toHaveBeenCalledOnce();
	});

	it("announces each change to the safe area once", async () => {
		const { installNativeInsets } = await loadNativeInsets();
		const { onSafeAreaChange } = await import("#lib/util/safe-area.ts");
		const changed = vi.fn();
		onSafeAreaChange(changed);
		window.__AndroidInsets = androidBridge(KEYBOARD_HIDDEN);

		installNativeInsets();
		window.__reapplyInsets({ ...KEYBOARD_HIDDEN });
		window.__reapplyInsets({ ...KEYBOARD_HIDDEN, left: 33 });

		expect(changed).toHaveBeenCalledTimes(2);
	});

	it("falls back to env() without the native bridge, once", async () => {
		const { installNativeInsets } = await loadNativeInsets();

		installNativeInsets();

		expect(safeAreas()).toEqual(ENV_SAFE_AREA);

		const setProperty = vi.spyOn(
			document.documentElement.style,
			"setProperty",
		);
		window.__reapplyInsets();

		expect(setProperty).not.toHaveBeenCalled();
		expect(remeasureScreenChrome).toHaveBeenCalledOnce();
	});

	it("holds a soft keyboard flip until the window resizes", async () => {
		const { installNativeInsets } = await loadNativeInsets();
		window.__AndroidInsets = androidBridge(KEYBOARD_HIDDEN);
		installNativeInsets();

		window.__reapplyInsets(KEYBOARD_SHOWN);
		expect(safeArea("bottom")).toBe("24px");

		window.dispatchEvent(new Event("resize"));
		expect(safeArea("bottom")).toBe("0px");
		expect(remeasureScreenChrome).toHaveBeenCalledTimes(2);
	});

	it("applies a held soft keyboard flip after 150 ms without a resize", async () => {
		vi.useFakeTimers();
		const { installNativeInsets } = await loadNativeInsets();
		window.__AndroidInsets = androidBridge(KEYBOARD_SHOWN);
		installNativeInsets();

		window.__reapplyInsets(KEYBOARD_HIDDEN);
		vi.advanceTimersByTime(149);
		expect(safeArea("bottom")).toBe("0px");

		vi.advanceTimersByTime(1);
		expect(safeArea("bottom")).toBe("24px");
	});

	it("applies only the newest of several held dispatches", async () => {
		const { installNativeInsets } = await loadNativeInsets();
		window.__AndroidInsets = androidBridge(KEYBOARD_HIDDEN);
		installNativeInsets();

		window.__reapplyInsets(KEYBOARD_SHOWN);
		window.__reapplyInsets({ ...KEYBOARD_SHOWN, top: 30 });
		window.dispatchEvent(new Event("resize"));

		expect(safeArea("top")).toBe("30px");
		expect(safeArea("bottom")).toBe("0px");
		expect(remeasureScreenChrome).toHaveBeenCalledTimes(2);
	});

	it("drops a held flip when the keyboard returns before the resize", async () => {
		vi.useFakeTimers();
		const { installNativeInsets } = await loadNativeInsets();
		window.__AndroidInsets = androidBridge(KEYBOARD_HIDDEN);
		installNativeInsets();

		window.__reapplyInsets(KEYBOARD_SHOWN);
		window.__reapplyInsets(KEYBOARD_HIDDEN);
		vi.runAllTimers();
		window.dispatchEvent(new Event("resize"));

		expect(safeArea("bottom")).toBe("24px");
		expect(remeasureScreenChrome).toHaveBeenCalledOnce();
	});
});

describe.each([
	{
		platform: "android",
		writes: pxSafeArea(ANDROID_INSETS),
		keyboardVisible: true,
	},
	{ platform: "ios", writes: pxSafeArea(IOS_INSETS), keyboardVisible: false },
	{ platform: "linux", writes: ENV_SAFE_AREA, keyboardVisible: undefined },
	{ platform: "macos", writes: ENV_SAFE_AREA, keyboardVisible: undefined },
	{ platform: "windows", writes: ENV_SAFE_AREA, keyboardVisible: undefined },
] satisfies {
	platform: SupportedPlatform;
	writes: Record<SafeAreaSide, string>;
	keyboardVisible: boolean | undefined;
}[])("on $platform", ({ platform, writes, keyboardVisible }) => {
	beforeEach(() => {
		runningOn(platform);
		window.__AndroidInsets = androidBridge(ANDROID_INSETS);
		window.__iosInsets = IOS_INSETS;
	});

	it("reads the safe area only from its own native source", async () => {
		const { installNativeInsets } = await loadNativeInsets();

		installNativeInsets();

		expect(safeAreas()).toEqual(writes);
	});

	it("reads the soft keyboard only from its own native source", async () => {
		const { softKeyboardVisibility } = await loadNativeInsets();

		expect(softKeyboardVisibility()).toBe(keyboardVisible);
	});

	it("reads no soft keyboard state before its native source exists", async () => {
		const { softKeyboardVisibility } = await loadNativeInsets();
		delete window.__AndroidInsets;
		delete window.__iosInsets;

		expect(softKeyboardVisibility()).toBeUndefined();
	});
});

describe("installNativeInsets with fallback insets", () => {
	it.each(["android", "ios", "linux", "macos", "windows"] as const)(
		"writes the fallback as px on %s without native insets",
		async (platform) => {
			runningOn(platform);
			const { installNativeInsets } = await loadNativeInsets();

			installNativeInsets({ fallback: FALLBACK_INSETS });

			expect(safeAreas()).toEqual(pxSafeArea(FALLBACK_INSETS));
		},
	);

	it("prefers the Android bridge over the fallback", async () => {
		runningOn("android");
		window.__AndroidInsets = androidBridge(ANDROID_INSETS);
		const { installNativeInsets } = await loadNativeInsets();

		installNativeInsets({ fallback: FALLBACK_INSETS });

		expect(safeAreas()).toEqual(pxSafeArea(ANDROID_INSETS));
	});

	it("prefers iOS insets set before mount over the fallback", async () => {
		runningOn("ios");
		window.__iosInsets = IOS_INSETS;
		const { installNativeInsets } = await loadNativeInsets();

		installNativeInsets({ fallback: FALLBACK_INSETS });

		expect(safeAreas()).toEqual(pxSafeArea(IOS_INSETS));
	});

	it("writes a dispatch over the fallback", async () => {
		runningOn("macos");
		const { installNativeInsets } = await loadNativeInsets();
		installNativeInsets({ fallback: FALLBACK_INSETS });

		window.__reapplyInsets({ ...FALLBACK_INSETS, bottom: 120 });

		expect(safeArea("bottom")).toBe("120px");
	});
});
