import { afterEach, describe, expect, it, vi } from "vitest";

import { paneFrame, settleDuration, stackMotion } from "./motion";

const slide = stackMotion({ platform: "android" });
const macos = stackMotion({ platform: "macos" });
const windows = stackMotion({ platform: "windows" });
const linux = stackMotion({ platform: "linux" });

describe("stackMotion", () => {
	it("keeps the full-width slide with parallax, scrim and edge on phones", () => {
		expect(slide).toEqual({
			travel: "pane",
			parallaxPercent: 33,
			fade: false,
			scrim: true,
			edge: true,
			settleMs: 540,
			commitEasing: "cubic-bezier(0.32, 0.72, 0, 1)",
			cancelEasing: "cubic-bezier(1, 0, 0.68, 0.28)",
		});
		expect(stackMotion({ platform: "ios" })).toBe(slide);
	});

	it("fades a page over the one behind in a quarter second on macOS", () => {
		expect(macos).toEqual({
			travel: 0,
			parallaxPercent: 0,
			fade: true,
			scrim: false,
			edge: false,
			settleMs: 250,
			commitEasing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
			cancelEasing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
		});
	});

	it("fades with a short decelerating slide on Windows", () => {
		expect(windows).toEqual({
			travel: 40,
			parallaxPercent: 0,
			fade: true,
			scrim: false,
			edge: false,
			settleMs: 300,
			commitEasing: "cubic-bezier(0, 0, 0, 1)",
			cancelEasing: "cubic-bezier(0, 0, 0, 1)",
		});
	});

	it("fades in place with a decelerating curve on Linux and other desktops", () => {
		expect(linux).toEqual({ ...windows, travel: 0, settleMs: 250 });
		expect(stackMotion({ platform: "freebsd" })).toBe(linux);
	});
});

describe("stackMotion in a browser", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("reads the pointer to slide under a finger and fade under a mouse", () => {
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: query === "(pointer: coarse)",
		}));
		expect(stackMotion()).toBe(slide);

		vi.stubGlobal("matchMedia", () => ({ matches: false }));
		expect(stackMotion()).toBe(macos);
	});
});

describe("paneFrame sliding", () => {
	it("covers the screen with the front pane at rest", () => {
		const frame = paneFrame({ progress: 0, parallax: true, motion: slide });
		expect(frame.front).toEqual({ transform: "translate3d(0.000%,0,0)" });
		expect(frame.back).toEqual({ transform: "translate3d(-33.000%,0,0)" });
		expect(frame.dim).toBe(1);
	});

	it("parks the front pane offscreen and the back pane centered when complete", () => {
		const frame = paneFrame({ progress: 1, parallax: true, motion: slide });
		expect(frame.front).toEqual({ transform: "translate3d(100.000%,0,0)" });
		expect(frame.back).toEqual({ transform: "translate3d(0.000%,0,0)" });
		expect(frame.dim).toBe(0);
	});

	it("moves the back pane at a third of the front pane's rate", () => {
		const half = paneFrame({
			progress: 0.5,
			parallax: true,
			motion: slide,
		});
		expect(half.front).toEqual({ transform: "translate3d(50.000%,0,0)" });
		expect(half.back).toEqual({ transform: "translate3d(-16.500%,0,0)" });
		expect(half.dim).toBe(0.5);
	});

	it("keeps the pane behind still without parallax while the front pane and the dim follow", () => {
		for (const progress of [0, 0.5, 1]) {
			const frame = paneFrame({
				progress,
				parallax: false,
				motion: slide,
			});
			expect(frame.back).toEqual({
				transform: "translate3d(0.000%,0,0)",
			});
			expect(frame).toEqual({
				...paneFrame({ progress, parallax: true, motion: slide }),
				back: frame.back,
			});
		}
	});
});

describe("paneFrame fading", () => {
	it("fades the front pane in place over a still, undimmed pane on macOS", () => {
		expect(
			[1, 0.5, 0].map((progress) =>
				paneFrame({ progress, parallax: true, motion: macos }),
			),
		).toEqual(
			["0.000", "0.500", "1.000"].map((opacity) => ({
				front: { transform: "translate3d(0.000px,0,0)", opacity },
				back: { transform: "translate3d(0.000%,0,0)", opacity: "1" },
				dim: 0,
			})),
		);
	});

	it("brings the front pane in from 40 px away on Windows", () => {
		expect(
			[1, 0.5, 0].map(
				(progress) =>
					paneFrame({ progress, parallax: true, motion: windows })
						.front,
			),
		).toEqual([
			{ transform: "translate3d(40.000px,0,0)", opacity: "0.000" },
			{ transform: "translate3d(20.000px,0,0)", opacity: "0.500" },
			{ transform: "translate3d(0.000px,0,0)", opacity: "1.000" },
		]);
	});
});

describe("settleDuration", () => {
	it("is instant when there is nothing left to travel", () => {
		expect(settleDuration({ from: 1, to: 1, motion: slide })).toBe(0);
	});

	it("takes the platform's full duration across the whole transition", () => {
		expect(settleDuration({ from: 0, to: 1, motion: slide })).toBe(540);
		expect(settleDuration({ from: 1, to: 0, motion: macos })).toBe(250);
		expect(settleDuration({ from: 1, to: 0, motion: windows })).toBe(300);
	});

	it("scales with the distance still to cover, in either direction", () => {
		expect(settleDuration({ from: 0.5, to: 1, motion: slide })).toBe(270);
		expect(settleDuration({ from: 0.75, to: 0, motion: slide })).toBe(405);
	});
});
