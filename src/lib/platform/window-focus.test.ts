import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { os, tauriWindow, focusListeners } = vi.hoisted(() => ({
	os: { desktop: true, mobile: false },
	tauriWindow: { focused: false },
	focusListeners: [] as ((event: { payload: boolean }) => void)[],
}));

vi.mock("./os", () => ({
	isDesktopPlatform: () => os.desktop,
	isMobilePlatform: () => os.mobile,
}));
vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({
		isFocused: () => Promise.resolve(tauriWindow.focused),
		onFocusChanged: (listener: (event: { payload: boolean }) => void) => {
			focusListeners.push(listener);
			return Promise.resolve(() => {});
		},
	}),
}));

async function freshModule() {
	vi.resetModules();
	return import("./window-focus");
}

function changeFocus(focused: boolean) {
	for (const listener of focusListeners) listener({ payload: focused });
}

function stubVisibility(state: DocumentVisibilityState) {
	return vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
}

function changeVisibility(
	visibility: ReturnType<typeof stubVisibility>,
	state: DocumentVisibilityState,
) {
	visibility.mockReturnValue(state);
	document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
	focusListeners.length = 0;
	os.desktop = true;
	os.mobile = false;
	tauriWindow.focused = false;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("desktop window focus", () => {
	it("follows the native window, not the page, which WebView2 keeps focused", async () => {
		const { windowFocused } = await freshModule();
		stubVisibility("visible");
		vi.spyOn(document, "hasFocus").mockReturnValue(true);

		windowFocused();
		await vi.waitFor(() => expect(windowFocused()).toBe(false));
		changeFocus(true);
		expect(windowFocused()).toBe(true);
		changeFocus(false);
		expect(windowFocused()).toBe(false);
	});

	it("does not count a focused window whose page is hidden, as behind a locked screen", async () => {
		const { windowFocused } = await freshModule();
		const visibility = stubVisibility("visible");
		windowFocused();
		changeFocus(true);

		changeVisibility(visibility, "hidden");

		expect(windowFocused()).toBe(false);
	});

	it("tells listeners once each time the window comes back, until they stop listening", async () => {
		const { onWindowReturn } = await freshModule();
		stubVisibility("visible");
		const returned = vi.fn();
		const stop = onWindowReturn(returned);
		await vi.waitFor(() => expect(focusListeners).toHaveLength(1));

		changeFocus(true);
		changeFocus(true);
		changeFocus(false);
		changeFocus(true);
		stop();
		changeFocus(false);
		changeFocus(true);

		expect(returned).toHaveBeenCalledTimes(2);
	});

	it("counts a page that turns visible in a focused window as a return", async () => {
		const { onWindowReturn } = await freshModule();
		const visibility = stubVisibility("hidden");
		const returned = vi.fn();
		onWindowReturn(returned);
		changeFocus(true);
		expect(returned).not.toHaveBeenCalled();

		changeVisibility(visibility, "visible");

		expect(returned).toHaveBeenCalledOnce();
	});
});

describe("mobile window focus", () => {
	it("counts the app as focused whenever it is visible, as the WebView never holds document focus", async () => {
		os.desktop = false;
		os.mobile = true;
		const { windowFocused } = await freshModule();
		vi.spyOn(document, "hasFocus").mockReturnValue(false);
		const visibility = stubVisibility("hidden");

		expect(windowFocused()).toBe(false);
		visibility.mockReturnValue("visible");
		expect(windowFocused()).toBe(true);
	});

	it("reports a return each time the app becomes visible again", async () => {
		os.desktop = false;
		os.mobile = true;
		const { onWindowReturn } = await freshModule();
		vi.spyOn(document, "hasFocus").mockReturnValue(false);
		const visibility = stubVisibility("hidden");
		const returned = vi.fn();
		const stop = onWindowReturn(returned);

		changeVisibility(visibility, "visible");
		changeVisibility(visibility, "hidden");
		changeVisibility(visibility, "visible");
		stop();
		changeVisibility(visibility, "hidden");
		changeVisibility(visibility, "visible");

		expect(returned).toHaveBeenCalledTimes(2);
	});
});

describe("browser window focus", () => {
	it("needs a visible page that also holds focus", async () => {
		os.desktop = false;
		const { windowFocused } = await freshModule();
		stubVisibility("visible");
		const focus = vi.spyOn(document, "hasFocus").mockReturnValue(false);

		expect(windowFocused()).toBe(false);
		focus.mockReturnValue(true);
		expect(windowFocused()).toBe(true);
	});
});
