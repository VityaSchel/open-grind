// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("$lib/haptics", () => ({ playHaptic: playHapticMock }));

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
