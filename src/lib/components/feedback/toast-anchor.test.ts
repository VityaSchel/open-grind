// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anchorToastsAbove } from "./toast-anchor";

let frames: FrameRequestCallback[];

function mount() {
	const host = document.createElement("div");
	host.dataset.slot = "toast-host";
	document.body.append(host);
	const showToaster = () => {
		const toaster = document.createElement("ol");
		toaster.setAttribute("data-sonner-toaster", "");
		toaster.dataset.yPosition = "bottom";
		host.append(toaster);
		return toaster;
	};
	return { host, showToaster };
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
		mount();

		const stop = anchorToastsAbove(() => 500);

		expect(frames).toHaveLength(0);
		stop();
	});

	it("follows the edge every frame while a toast is shown and rests once it goes", async () => {
		const { showToaster } = mount();
		const stop = anchorToastsAbove(() => 500);

		const toaster = showToaster();
		await settleObservers();

		expect(frames).toHaveLength(1);
		expect(toaster.hasAttribute("data-sheet-anchored")).toBe(true);

		toaster.remove();
		frames.shift()?.(0);

		expect(frames).toHaveLength(0);
		stop();
	});

	it("lifts the toasts to sit above the edge it follows", async () => {
		const { showToaster } = mount();
		vi.stubGlobal("innerHeight", 800);
		let edge = 500;
		const stop = anchorToastsAbove(() => edge);

		const toaster = showToaster();
		await settleObservers();
		expect(toaster.style.getPropertyValue("--sheet-anchor")).toBe("300px");

		edge = 620;
		frames.shift()?.(0);

		expect(toaster.style.getPropertyValue("--sheet-anchor")).toBe("180px");
		stop();
		expect(toaster.hasAttribute("data-sheet-anchored")).toBe(false);
		expect(toaster.style.getPropertyValue("--sheet-anchor")).toBe("");
	});

	it("lets the toasts rest in their usual place while there is no edge", async () => {
		const { showToaster } = mount();
		let edge: number | null = 500;
		const stop = anchorToastsAbove(() => edge);
		const toaster = showToaster();
		await settleObservers();
		expect(toaster.hasAttribute("data-sheet-anchored")).toBe(true);

		edge = null;
		frames.shift()?.(0);

		expect(toaster.hasAttribute("data-sheet-anchored")).toBe(false);
		expect(toaster.style.getPropertyValue("--sheet-anchor")).toBe("");
		stop();
	});
});
