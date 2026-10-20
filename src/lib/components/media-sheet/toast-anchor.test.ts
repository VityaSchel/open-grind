// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anchorToastsAbove } from "./toast-anchor";

let frames: FrameRequestCallback[];

function mount() {
	const host = document.createElement("div");
	host.dataset.slot = "toast-host";
	const sheet = document.createElement("div");
	const panel = document.createElement("div");
	panel.dataset.slot = "sheet-panel";
	panel.getBoundingClientRect = () => ({ top: 500 }) as DOMRect;
	sheet.append(panel);
	document.body.append(host, sheet);
	const showToaster = () => {
		const toaster = document.createElement("ol");
		toaster.setAttribute("data-sonner-toaster", "");
		toaster.dataset.yPosition = "bottom";
		host.append(toaster);
		return toaster;
	};
	return { host, sheet, showToaster };
}

const settleObservers = () => Promise.resolve();

beforeEach(() => {
	frames = [];
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frames.push(callback);
		return frames.length;
	});
	vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

describe("anchorToastsAbove", () => {
	it("asks for no frames while no toast is shown", () => {
		const { sheet } = mount();

		const stop = anchorToastsAbove(sheet);

		expect(frames).toHaveLength(0);
		stop();
	});

	it("follows the sheet every frame while a toast is shown and rests once it goes", async () => {
		const { sheet, showToaster } = mount();
		const stop = anchorToastsAbove(sheet);

		const toaster = showToaster();
		await settleObservers();

		expect(frames).toHaveLength(1);
		expect(toaster.hasAttribute("data-sheet-anchored")).toBe(true);

		toaster.remove();
		frames.shift()?.(0);

		expect(frames).toHaveLength(0);
		stop();
	});
});
