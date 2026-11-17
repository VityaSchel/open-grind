// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("#lib/haptics.ts", () => ({ playHaptic: playHapticMock }));

const { sendTapMock, showErrorToastMock } = vi.hoisted(() => ({
	sendTapMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));
vi.mock("#lib/api/interest/taps.ts", () => ({ sendTap: sendTapMock }));
vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));

import { TapType } from "#lib/model/interest/taps.ts";
import { contextMenuEvent } from "#lib/test/context-menu.ts";
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
