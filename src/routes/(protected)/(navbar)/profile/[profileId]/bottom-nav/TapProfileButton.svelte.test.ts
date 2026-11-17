// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playHapticMock, sendTapMock, showErrorToastMock } = vi.hoisted(() => ({
	playHapticMock: vi.fn(),
	sendTapMock: vi.fn(() => Promise.resolve({ isMutual: false })),
	showErrorToastMock: vi.fn(),
}));
vi.mock("#lib/haptics.ts", () => ({ playHaptic: playHapticMock }));
vi.mock("#lib/api/interest/taps.ts", () => ({ sendTap: sendTapMock }));
vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));

import { TapType } from "#lib/model/interest/taps.ts";
import { contextMenuEvent } from "#lib/test/context-menu.ts";
import { useHoldClock } from "#lib/test/long-press.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { pointerEvent } from "#lib/test/pointer.ts";
import { LONG_PRESS_DURATION_MS } from "#lib/util/long-press.ts";
import TapProfileButton from "./TapProfileButton.svelte";

function renderButton() {
	const { getByRole } = render(TapProfileButton, {
		props: { profileId: 2, tapType: null, onTap: () => {} },
	});
	return getByRole("button", { name: "Send a Fire tap" });
}

function pointerClick() {
	return new MouseEvent("click", { bubbles: true, detail: 1 });
}

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

describe("tap picker on Android", () => {
	beforeEach(() => {
		runningOn("android");
	});

	it("still sends one Fire tap for a click after a touch long press", () => {
		const button = renderButton();

		button.dispatchEvent(contextMenuEvent({ pointerType: "touch" }));
		button.dispatchEvent(pointerClick());

		expect(sendTapMock).toHaveBeenCalledExactlyOnceWith({
			recipientId: 2,
			tapType: TapType.Hot,
		});
	});
});

describe("tap picker on iOS", () => {
	useHoldClock();

	beforeEach(() => {
		runningOn("ios");
	});

	it("opens the picker once a touch is held, with one haptic tap", async () => {
		const button = renderButton();

		button.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);
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
		vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);
		button.dispatchEvent(pointerEvent("pointerup"));
		button.dispatchEvent(pointerClick());

		expect(sendTapMock).not.toHaveBeenCalled();
	});

	it("sends no tap for the hold's click even when it arrives late", () => {
		const button = renderButton();

		button.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);
		button.dispatchEvent(pointerEvent("pointerup"));
		vi.advanceTimersByTime(1000);
		button.dispatchEvent(pointerClick());

		expect(sendTapMock).not.toHaveBeenCalled();
	});

	it("still sends a Fire tap for a keyboard activation after a hold", () => {
		const button = renderButton();

		button.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);
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

describe("tap labels", () => {
	beforeEach(() => {
		runningOn("android");
	});

	afterEach(() => {
		vi.restoreAllMocks();
		sendTapMock.mockReset();
		showErrorToastMock.mockReset();
	});

	it.each([
		[null, "Send a Fire tap"],
		[TapType.Friendly, "Cookie tap sent"],
		[TapType.Hot, "Fire tap sent"],
		[TapType.Looking, "Demon tap sent"],
	])("labels the button for tap type %s", (tapType, label) => {
		const { getAllByRole } = render(TapProfileButton, {
			props: { profileId: 2, tapType, onTap: () => {} },
		});

		expect(getAllByRole("button")[0]!.getAttribute("aria-label")).toBe(
			label,
		);
	});

	it("tells keyboard users where the other taps are", () => {
		const button = renderButton();

		const hint = document.getElementById(
			button.getAttribute("aria-describedby") ?? "",
		);

		expect(hint?.textContent).toBe(
			"Shift+F10 or the next button offers the other taps",
		);
		expect(button.getAttribute("aria-haspopup")).toBeNull();
	});

	it("opens the tap menu from the Choose a tap button", async () => {
		renderButton();
		const choose = screen.getByRole("button", { name: "Choose a tap" });
		expect(choose.getAttribute("aria-haspopup")).toBe("menu");

		await fireEvent.click(choose);

		expect(
			await screen.findAllByRole("menuitem", { hidden: true }),
		).toHaveLength(3);
		expect(choose.getAttribute("aria-expanded")).toBe("true");
	});

	it("keeps a sent tap focusable without sending again or offering the menu", async () => {
		const { getByRole, queryByRole } = render(TapProfileButton, {
			props: { profileId: 2, tapType: TapType.Hot, onTap: () => {} },
		});
		const button = getByRole("button", { name: "Fire tap sent" });

		button.focus();
		await fireEvent.click(button);
		button.dispatchEvent(contextMenuEvent({ pointerType: "mouse" }));

		expect(document.activeElement).toBe(button);
		expect(button.getAttribute("aria-disabled")).toBe("true");
		expect(button.hasAttribute("disabled")).toBe(false);
		expect(sendTapMock).not.toHaveBeenCalled();
		expect(queryByRole("button", { name: "Choose a tap" })).toBeNull();
		expect(queryByRole("menuitem")).toBeNull();
	});

	it("offers each tap type by name in the tap menu", async () => {
		const button = renderButton();

		button.dispatchEvent(contextMenuEvent({ pointerType: "mouse" }));
		const items = await screen.findAllByRole("menuitem");

		expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
			"Send a Cookie tap",
			"Send a Fire tap",
			"Send a Demon tap",
		]);
	});

	it("names the failure when a tap does not send", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		sendTapMock.mockRejectedValue(new Error("offline"));
		const button = renderButton();

		await fireEvent.click(button);

		await vi.waitFor(() => {
			expect(showErrorToastMock).toHaveBeenCalledWith(
				expect.objectContaining({ label: "Couldn’t send tap" }),
			);
		});
	});
});
