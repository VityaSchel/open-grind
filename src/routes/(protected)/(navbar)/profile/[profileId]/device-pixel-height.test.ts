import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { devicePixelHeight } from "./device-pixel-height";

const DEVICE_PIXEL_RATIO = 2.625;

function frameOf(height: number): HTMLElement {
	const frame = document.createElement("div");
	vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(
		DOMRect.fromRect({ width: 412, height }),
	);
	return frame;
}

function snappedDevicePixels(height: number): number {
	const frame = frameOf(height);
	const detach = devicePixelHeight(frame);
	const snapped = Number.parseFloat(
		frame.style.getPropertyValue("--device-pixel-height"),
	);
	if (typeof detach === "function") detach();
	return Math.round(snapped * DEVICE_PIXEL_RATIO);
}

beforeEach(() => {
	vi.stubGlobal("devicePixelRatio", DEVICE_PIXEL_RATIO);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({
			addEventListener: () => {},
			removeEventListener: () => {},
		})),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("devicePixelHeight", () => {
	it("drops the partial device pixel at the bottom of the frame", () => {
		expect(snappedDevicePixels(1312.5 / DEVICE_PIXEL_RATIO)).toBe(1312);
	});

	it("keeps a whole device pixel that float rounding reads as slightly less", () => {
		const height = 1359 / DEVICE_PIXEL_RATIO;
		expect(Math.floor(height * DEVICE_PIXEL_RATIO)).toBe(1358);

		expect(snappedDevicePixels(height)).toBe(1359);
	});
});
