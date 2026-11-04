import { describe, expect, it } from "vitest";

import {
	paneFrame,
	releaseTiming,
	settleDuration,
	settleTiming,
	stackMotion,
} from "./motion";

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
	});

	it("slides like Android on iOS, and finishes a release on a critically damped spring", () => {
		expect(stackMotion({ platform: "ios" })).toEqual({
			...slide,
			release: { responseMs: 350, settledWithin: 0.003 },
		});
		expect(slide.release).toBeUndefined();
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

	it("fades in place with a decelerating curve on Linux", () => {
		expect(linux).toEqual({ ...windows, travel: 0, settleMs: 250 });
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

const ios = stackMotion({ platform: "ios" });
const spring = ios.release!;

function linearStops(easing: string): number[] {
	const inner = /^linear\((.*)\)$/.exec(easing)?.[1];
	if (inner === undefined)
		throw new Error(`not a linear() easing: ${easing}`);
	return inner.split(", ").map(Number);
}

describe("releaseTiming", () => {
	it("takes about 450 ms from a standstill, as UIKit's pop does", () => {
		const { duration } = releaseTiming({
			distance: 0.5,
			velocity: 0,
			spring,
			linearEasing: true,
		});

		expect(duration).toBeGreaterThan(430);
		expect(duration).toBeLessThan(470);
	});

	it("finishes sooner the faster the finger let go", () => {
		const durations = [0, 1, 3, 6].map(
			(velocity) =>
				releaseTiming({
					distance: 0.5,
					velocity,
					spring,
					linearEasing: true,
				}).duration,
		);

		expect([...durations].sort((a, b) => b - a)).toEqual(durations);
		expect(new Set(durations).size).toBe(4);
	});

	it("starts at the release speed and never runs past the target", () => {
		const distance = 0.4;
		const velocity = 2;
		const { duration, easing } = releaseTiming({
			distance,
			velocity,
			spring,
			linearEasing: true,
		});
		const stops = linearStops(easing);
		const step = duration / (stops.length - 1) / 1000;

		expect(stops[0]).toBe(0);
		expect(stops.at(-1)).toBe(1);
		expect(stops[1]! / step).toBeCloseTo(velocity / distance, -1);
		for (const [index, stop] of stops.entries()) {
			expect(stop).toBeLessThanOrEqual(1);
			if (index > 0)
				expect(stop).toBeGreaterThanOrEqual(stops[index - 1]!);
		}
	});

	it("holds a fling that would overshoot at the target instead of springing past it", () => {
		const { easing } = releaseTiming({
			distance: 0.1,
			velocity: 4,
			spring,
			linearEasing: true,
		});

		expect(Math.max(...linearStops(easing))).toBe(1);
	});

	it("holds still before turning around a finger that let go moving away", () => {
		const stops = linearStops(
			releaseTiming({
				distance: -0.2,
				velocity: 1.5,
				spring,
				linearEasing: true,
			}).easing,
		);

		expect(stops.slice(0, 2)).toEqual([0, 0]);
		expect(Math.min(...stops)).toBe(0);
	});

	it("falls back to a curve whose start matches the release speed without linear()", () => {
		const resting = releaseTiming({
			distance: 0.5,
			velocity: 0,
			spring,
			linearEasing: false,
		});
		expect(resting.easing).toBe("cubic-bezier(0.09, 0, 0.12, 1)");

		const released = releaseTiming({
			distance: 0.5,
			velocity: 1,
			spring,
			linearEasing: false,
		});
		const [x1, y1] = /^cubic-bezier\((.*)\)$/
			.exec(released.easing)![1]!
			.split(", ")
			.map(Number);
		expect(y1! / x1!).toBeCloseTo((2 * released.duration) / 1000, 3);
	});

	it("keeps the fallback curve from overshooting on a fling", () => {
		const { easing } = releaseTiming({
			distance: 0.1,
			velocity: 6,
			spring,
			linearEasing: false,
		});
		const [, y1] = /^cubic-bezier\((.*)\)$/
			.exec(easing)![1]!
			.split(", ")
			.map(Number);

		expect(y1).toBeLessThanOrEqual(1);
	});

	it("is instant when there is nothing left to travel", () => {
		expect(
			releaseTiming({
				distance: 0,
				velocity: 3,
				spring,
				linearEasing: true,
			}),
		).toEqual({ duration: 0, easing: "linear" });
	});
});

describe("settleTiming", () => {
	it("keeps the fixed settle for navigations and on Android", () => {
		expect(
			settleTiming({ from: 0.5, to: 1, intent: "commit", motion: ios }),
		).toEqual({ duration: 270, easing: ios.commitEasing });
		expect(
			settleTiming({
				from: 0.5,
				to: 0,
				intent: "cancel",
				velocity: 2,
				motion: slide,
			}),
		).toEqual({ duration: 270, easing: slide.cancelEasing });
	});

	it("rides the release spring for an iOS swipe that let go", () => {
		const timing = settleTiming({
			from: 0.5,
			to: 1,
			intent: "commit",
			velocity: 1,
			motion: ios,
		});

		expect(timing).toEqual(
			releaseTiming({ distance: 0.5, velocity: 1, spring }),
		);
		expect(timing.easing).toMatch(/^linear\(0, /);
	});
});
