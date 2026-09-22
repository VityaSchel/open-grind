import { describe, expect, it } from "vitest";

import { paneFrame, SETTLE_MS, settleDuration } from "./motion";

describe("paneFrame", () => {
	it("covers the screen with the front pane at rest", () => {
		const frame = paneFrame({ progress: 0, parallax: true });
		expect(frame.front).toBe("translate3d(0.000%,0,0)");
		expect(frame.back).toBe("translate3d(-33.000%,0,0)");
		expect(frame.dim).toBeCloseTo(0.1);
	});

	it("parks the front pane offscreen and the back pane centered when complete", () => {
		const frame = paneFrame({ progress: 1, parallax: true });
		expect(frame.front).toBe("translate3d(100.000%,0,0)");
		expect(frame.back).toBe("translate3d(0.000%,0,0)");
		expect(frame.dim).toBe(0);
	});

	it("moves the back pane at a third of the front pane's rate", () => {
		const half = paneFrame({ progress: 0.5, parallax: true });
		expect(half.front).toBe("translate3d(50.000%,0,0)");
		expect(half.back).toBe("translate3d(-16.500%,0,0)");
		expect(half.dim).toBeCloseTo(0.05);
	});
});

describe("paneFrame without parallax", () => {
	it("keeps the pane behind still while the front pane and the dim follow", () => {
		for (const progress of [0, 0.5, 1]) {
			const frame = paneFrame({ progress, parallax: false });
			expect(frame.back).toBe("translate3d(0.000%,0,0)");
			expect(frame).toEqual({
				...paneFrame({ progress, parallax: true }),
				back: frame.back,
			});
		}
	});
});

describe("settleDuration", () => {
	it("is instant when there is nothing left to travel", () => {
		expect(settleDuration(1, 1)).toBe(0);
	});

	it("takes the full duration across the whole pane", () => {
		expect(settleDuration(0, 1)).toBe(SETTLE_MS);
	});

	it("scales with the distance still to cover, in either direction", () => {
		expect(settleDuration(0.5, 1)).toBe(SETTLE_MS / 2);
		expect(settleDuration(0.75, 0)).toBe(SETTLE_MS * 0.75);
	});
});
