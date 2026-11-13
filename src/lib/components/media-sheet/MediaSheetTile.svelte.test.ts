// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("#lib/haptics.ts", () => ({ playHaptic: playHapticMock }));

import { contextMenuEvent } from "#lib/test/context-menu.ts";
import { useHoldClock } from "#lib/test/long-press.ts";
import { pointerEvent } from "#lib/test/pointer.ts";
import MediaSheetTile from "./MediaSheetTile.svelte";

const LONG_PRESS_MS = 450;

function renderTile({ busy }: { busy: boolean }) {
	const onMenu = vi.fn();
	const { getByRole } = render(MediaSheetTile, {
		props: {
			src: null,
			video: false,
			index: 0,
			selected: false,
			clickable: true,
			busy,
			onclick: () => {},
			onMenu,
		},
	});
	return { tile: getByRole("button"), onMenu };
}

useHoldClock();

beforeEach(() => {
	playHapticMock.mockReset();
});

afterEach(() => {
	cleanup();
});

describe("media tile long press", () => {
	it("taps once as a touch hold opens the tile's menu", () => {
		const { tile, onMenu } = renderTile({ busy: false });

		tile.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_MS);

		expect(onMenu).toHaveBeenCalledOnce();
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("stays quiet when a touch hold lands on a tile being deleted", () => {
		const { tile, onMenu } = renderTile({ busy: true });

		tile.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_MS);
		const menuEvent = contextMenuEvent({ pointerType: "touch" });
		tile.dispatchEvent(menuEvent);

		expect(onMenu).not.toHaveBeenCalled();
		expect(playHapticMock).not.toHaveBeenCalled();
		expect(menuEvent.defaultPrevented).toBe(true);
	});
});
