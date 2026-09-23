import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NativeInsets } from "./android-native-bridge";

const remeasureScreenChrome = vi.hoisted(() => vi.fn());

vi.mock("$lib/util/screen-chrome.svelte", () => ({ remeasureScreenChrome }));

const KEYBOARD_HIDDEN: NativeInsets = {
	top: 47.42857142857143,
	bottom: 24,
	left: 0,
	right: 0,
	ime: false,
};

const KEYBOARD_SHOWN: NativeInsets = {
	...KEYBOARD_HIDDEN,
	bottom: 0,
	ime: true,
};

async function loadApplyAndroidInsets() {
	vi.resetModules();
	const { applyAndroidInsets } = await import("./android-native-bridge");
	return applyAndroidInsets;
}

function safeArea(side: "top" | "bottom" | "left" | "right") {
	return document.documentElement.style.getPropertyValue(
		`--safe-area-${side}`,
	);
}

beforeEach(() => {
	remeasureScreenChrome.mockClear();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	delete window.__AndroidInsets;
	document.documentElement.removeAttribute("style");
});

describe("applyAndroidInsets", () => {
	it("writes the native bridge values as px without probing env()", async () => {
		const applyAndroidInsets = await loadApplyAndroidInsets();
		const appendChild = vi.spyOn(document.documentElement, "appendChild");
		const getComputedStyle = vi.spyOn(window, "getComputedStyle");
		window.__AndroidInsets = {
			top: () => 64,
			bottom: () => 47.5,
			left: () => 0,
			right: () => 0,
		};

		applyAndroidInsets();

		expect(safeArea("top")).toBe("64px");
		expect(safeArea("bottom")).toBe("47.5px");
		expect(safeArea("left")).toBe("0px");
		expect(safeArea("right")).toBe("0px");
		expect(appendChild).not.toHaveBeenCalled();
		expect(getComputedStyle).not.toHaveBeenCalled();
		expect(remeasureScreenChrome).toHaveBeenCalledOnce();
	});

	it("writes dispatched values over the bridge getters", async () => {
		const applyAndroidInsets = await loadApplyAndroidInsets();
		window.__AndroidInsets = {
			top: () => 0,
			bottom: () => 0,
			left: () => 0,
			right: () => 0,
		};

		applyAndroidInsets(KEYBOARD_HIDDEN);

		expect(safeArea("top")).toBe("47.42857142857143px");
		expect(safeArea("bottom")).toBe("24px");
	});

	it("leaves the root style alone when the insets did not change", async () => {
		const applyAndroidInsets = await loadApplyAndroidInsets();
		applyAndroidInsets(KEYBOARD_HIDDEN);
		const setProperty = vi.spyOn(
			document.documentElement.style,
			"setProperty",
		);

		applyAndroidInsets({ ...KEYBOARD_HIDDEN });

		expect(setProperty).not.toHaveBeenCalled();
		expect(remeasureScreenChrome).toHaveBeenCalledOnce();
	});

	it("falls back to env() without the native bridge, once", async () => {
		const applyAndroidInsets = await loadApplyAndroidInsets();

		applyAndroidInsets();

		expect(safeArea("top")).toBe("env(safe-area-inset-top, 0px)");
		expect(safeArea("bottom")).toBe("env(safe-area-inset-bottom, 0px)");
		expect(safeArea("left")).toBe("env(safe-area-inset-left, 0px)");
		expect(safeArea("right")).toBe("env(safe-area-inset-right, 0px)");

		const setProperty = vi.spyOn(
			document.documentElement.style,
			"setProperty",
		);
		applyAndroidInsets();

		expect(setProperty).not.toHaveBeenCalled();
		expect(remeasureScreenChrome).toHaveBeenCalledOnce();
	});

	it("holds a soft keyboard flip until the window resizes", async () => {
		const applyAndroidInsets = await loadApplyAndroidInsets();
		applyAndroidInsets(KEYBOARD_HIDDEN);

		applyAndroidInsets(KEYBOARD_SHOWN);
		expect(safeArea("bottom")).toBe("24px");

		window.dispatchEvent(new Event("resize"));
		expect(safeArea("bottom")).toBe("0px");
		expect(remeasureScreenChrome).toHaveBeenCalledTimes(2);
	});

	it("applies a held soft keyboard flip after 150 ms without a resize", async () => {
		vi.useFakeTimers();
		const applyAndroidInsets = await loadApplyAndroidInsets();
		applyAndroidInsets(KEYBOARD_SHOWN);

		applyAndroidInsets(KEYBOARD_HIDDEN);
		vi.advanceTimersByTime(149);
		expect(safeArea("bottom")).toBe("0px");

		vi.advanceTimersByTime(1);
		expect(safeArea("bottom")).toBe("24px");
	});

	it("applies only the newest of several held dispatches", async () => {
		const applyAndroidInsets = await loadApplyAndroidInsets();
		applyAndroidInsets(KEYBOARD_HIDDEN);

		applyAndroidInsets(KEYBOARD_SHOWN);
		applyAndroidInsets({ ...KEYBOARD_SHOWN, top: 30 });
		window.dispatchEvent(new Event("resize"));

		expect(safeArea("top")).toBe("30px");
		expect(safeArea("bottom")).toBe("0px");
		expect(remeasureScreenChrome).toHaveBeenCalledTimes(2);
	});

	it("drops a held flip when the keyboard returns before the resize", async () => {
		vi.useFakeTimers();
		const applyAndroidInsets = await loadApplyAndroidInsets();
		applyAndroidInsets(KEYBOARD_HIDDEN);

		applyAndroidInsets(KEYBOARD_SHOWN);
		applyAndroidInsets(KEYBOARD_HIDDEN);
		vi.runAllTimers();
		window.dispatchEvent(new Event("resize"));

		expect(safeArea("bottom")).toBe("24px");
		expect(remeasureScreenChrome).toHaveBeenCalledOnce();
	});
});
