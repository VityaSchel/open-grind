// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("$lib/haptics", () => ({ playHaptic: playHapticMock }));

const { sendTapMock, showErrorToastMock } = vi.hoisted(() => ({
	sendTapMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));
vi.mock("$lib/api/interest/taps", () => ({ sendTap: sendTapMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));

import { TapType } from "$lib/model/interest/taps";
import { contextMenuEvent } from "$lib/test/context-menu";
import TapProfileButton from "./TapProfileButton.svelte";

function renderButton() {
	const { getByRole } = render(TapProfileButton, {
		props: { profileId: 2, tapType: null, onTap: () => {} },
	});
	return getByRole("button", { name: "Send a Fire tap" });
}

afterEach(() => {
	cleanup();
	playHapticMock.mockReset();
});

describe("tap menu haptics", () => {
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

describe("tap labels", () => {
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
		const { getByRole } = render(TapProfileButton, {
			props: { profileId: 2, tapType, onTap: () => {} },
		});

		expect(getByRole("button").getAttribute("aria-label")).toBe(label);
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
				expect.objectContaining({ label: "Failed to send tap" }),
			);
		});
	});
});
