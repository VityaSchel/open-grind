// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playHapticMock, sendTapMock } = vi.hoisted(() => ({
	playHapticMock: vi.fn(),
	sendTapMock: vi.fn(() => Promise.resolve({ isMutual: false })),
}));
vi.mock("$lib/haptics", () => ({ playHaptic: playHapticMock }));
vi.mock("$lib/api/interest/taps", () => ({ sendTap: sendTapMock }));

import { TapType } from "$lib/model/interest/taps";
import { contextMenuEvent } from "$lib/test/context-menu";
import { resetPlatform, runningOn } from "$lib/test/platform";
import { pointerEvent } from "$lib/test/pointer";
import TapProfileButton from "./TapProfileButton.svelte";

const LONG_PRESS_MS = 450;

function renderButton() {
	const { getByRole } = render(TapProfileButton, {
		props: { profileId: 2, tapType: null, onTap: () => {} },
	});
	return getByRole("button", { name: "Send a Fire tap" });
}

function pointerClick() {
	return new MouseEvent("click", { bubbles: true, detail: 1 });
}

let clock = 1_700_000_000_000;

afterEach(() => {
	cleanup();
	playHapticMock.mockReset();
	sendTapMock.mockClear();
	resetPlatform();
});

describe("tap menu haptics", () => {
	beforeEach(() => {
		runningOn("android");
	});

	it("taps once when a touch long press opens the tap menu", () => {
		const button = renderButton();

		button.dispatchEvent(contextMenuEvent({ pointerType: "touch" }));
		button.dispatchEvent(contextMenuEvent({ pointerType: "touch" }));

		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("stays quiet when a right-click opens the tap menu", () => {
		const button = renderButton();

		button.dispatchEvent(contextMenuEvent({ pointerType: "mouse" }));

		expect(playHapticMock).not.toHaveBeenCalled();
	});
});

describe("tap picker on iOS", () => {
	beforeEach(() => {
		runningOn("ios");
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		vi.setSystemTime((clock += 60_000));
	});

	afterEach(() => {
		window.dispatchEvent(new Event("pointerup"));
		vi.useRealTimers();
	});

	it("opens the picker once a touch is held, with one haptic tap", async () => {
		const button = renderButton();

		button.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_MS);
		vi.useRealTimers();

		expect(
			await screen.findByRole("menuitem", {
				name: "Send a Cookie tap",
				hidden: true,
			}),
		).toBeTruthy();
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("sends no tap for the click the hold leaves behind", () => {
		const button = renderButton();

		button.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_MS);
		button.dispatchEvent(pointerEvent("pointerup"));
		button.dispatchEvent(pointerClick());

		expect(sendTapMock).not.toHaveBeenCalled();
	});

	it("sends no tap for the hold's click even when it arrives late", () => {
		const button = renderButton();

		button.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_MS);
		button.dispatchEvent(pointerEvent("pointerup"));
		vi.advanceTimersByTime(1000);
		button.dispatchEvent(pointerClick());

		expect(sendTapMock).not.toHaveBeenCalled();
	});

	it("still sends a Fire tap for a keyboard activation after a hold", () => {
		const button = renderButton();

		button.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_MS);
		button.dispatchEvent(pointerEvent("pointerup"));
		button.dispatchEvent(pointerClick());
		vi.advanceTimersByTime(1000);
		button.click();

		expect(sendTapMock).toHaveBeenCalledExactlyOnceWith({
			recipientId: 2,
			tapType: TapType.Hot,
		});
	});

	it("still sends a Fire tap for a quick tap", () => {
		const button = renderButton();

		button.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(100);
		button.dispatchEvent(pointerEvent("pointerup"));
		button.click();

		expect(sendTapMock).toHaveBeenCalledExactlyOnceWith({
			recipientId: 2,
			tapType: TapType.Hot,
		});
	});
});
