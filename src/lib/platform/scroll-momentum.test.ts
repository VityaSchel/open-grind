// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
	invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke,
}));

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { SupportedPlatform } from "#lib/platform/os.ts";
import { stopScrollMomentum } from "./scroll-momentum";

function scrollable(element: HTMLElement, overflowing = true): HTMLElement {
	element.style.overflowY = "auto";
	Object.defineProperty(element, "scrollHeight", {
		value: overflowing ? 2000 : 0,
	});
	return element;
}

function list({ covered = false } = {}): HTMLElement {
	const element = scrollable(document.createElement("div"));
	vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 62, 402, 778),
	);
	document.body.append(element);
	document.elementFromPoint = () => (covered ? document.body : element);
	return element;
}

function hitting(byHeight: (y: number) => Element): void {
	document.elementFromPoint = (_x, y) => byHeight(y);
}

afterEach(() => {
	resetPlatform();
	invoke.mockReset();
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe("stopScrollMomentum", () => {
	it("on iOS stops the list under its uncovered center and settles once native has", async () => {
		runningOn("ios");
		invoke.mockResolvedValue(null);

		const stopping = stopScrollMomentum(list());

		expect(invoke).toHaveBeenCalledWith("stop_scroll_momentum", {
			at: { x: 201, y: 451 },
		});
		await expect(stopping).resolves.toBeUndefined();
	});

	it("on iOS leaves a list alone when something covers its center", () => {
		runningOn("ios");

		expect(stopScrollMomentum(list({ covered: true }))).toBeUndefined();
		expect(invoke).not.toHaveBeenCalled();
	});

	it("on iOS stops the list lower down when a nested scroller sits under its center", async () => {
		runningOn("ios");
		invoke.mockResolvedValue(null);
		const scroller = list();
		const carousel = scrollable(document.createElement("div"));
		const photo = document.createElement("img");
		const details = document.createElement("p");
		carousel.append(photo);
		scroller.append(carousel, details);
		hitting((y) => (y < 500 ? photo : details));

		await stopScrollMomentum(scroller);

		expect(invoke).toHaveBeenCalledWith("stop_scroll_momentum", {
			at: { x: 201, y: 645.5 },
		});
	});

	it("on iOS looks through a nested element that has nothing to scroll", async () => {
		runningOn("ios");
		invoke.mockResolvedValue(null);
		const scroller = list();
		const idle = scrollable(document.createElement("div"), false);
		const row = document.createElement("p");
		idle.append(row);
		scroller.append(idle);
		hitting(() => row);

		await stopScrollMomentum(scroller);

		expect(invoke).toHaveBeenCalledWith("stop_scroll_momentum", {
			at: { x: 201, y: 451 },
		});
	});

	it("on iOS leaves a list alone when nested scrollers cover every probed point", () => {
		runningOn("ios");
		const scroller = list();
		const strip = document.createElement("div");
		strip.style.overflowX = "auto";
		Object.defineProperty(strip, "scrollWidth", { value: 900 });
		scroller.append(strip);
		hitting(() => strip);

		expect(stopScrollMomentum(scroller)).toBeUndefined();
		expect(invoke).not.toHaveBeenCalled();
	});

	it("still settles when native fails to stop the list", async () => {
		runningOn("ios");
		invoke.mockRejectedValue(new Error("no webview"));
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(stopScrollMomentum(list())).resolves.toBeUndefined();
		expect(logged).toHaveBeenCalled();
	});

	for (const platform of [
		"android",
		"linux",
		"macos",
		"windows",
	] satisfies SupportedPlatform[]) {
		it(`leaves momentum to the WebView on ${platform}`, () => {
			runningOn(platform);

			expect(stopScrollMomentum(list())).toBeUndefined();
			expect(invoke).not.toHaveBeenCalled();
		});
	}
});
