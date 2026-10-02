import { describe, expect, it } from "vitest";

import { stackMotion } from "./motion";
import { StackSettle } from "./settle";
import { fakeSurface, settleLast } from "./stack-test-helpers";

const slide = stackMotion({ platform: "android" });

function makeSettle({ reducedMotion = false, motion = slide } = {}) {
	const { surface, applied, animations } = fakeSurface();
	const settle = new StackSettle({
		surface,
		motion,
		reducedMotion: () => reducedMotion,
	});
	return { settle, applied, animations };
}

describe("StackSettle tracking", () => {
	it("clamps the finger to the pane and applies it", () => {
		const { settle, applied } = makeSettle();

		settle.track(-0.5);
		expect(settle.progress).toBe(0);
		settle.track(0.4);
		expect(settle.progress).toBe(0.4);
		settle.track(3);
		expect(settle.progress).toBe(1);

		expect(applied).toEqual([0, 0.4, 1]);
	});
});

describe("StackSettle settling", () => {
	it("scales the settle to the distance left", () => {
		const { settle, animations } = makeSettle();
		settle.track(0.25);

		void settle.settleTo({ target: 1, intent: "commit" });

		expect(animations.at(-1)).toMatchObject({
			from: 0.25,
			to: 1,
			duration: slide.settleMs * 0.75,
			easing: slide.commitEasing,
		});
	});

	it("eases a canceled settle with the cancel curve", () => {
		const { settle, animations } = makeSettle();
		settle.track(0.25);

		void settle.settleTo({ target: 0, intent: "cancel" });

		expect(animations.at(-1)).toMatchObject({
			duration: slide.settleMs * 0.25,
			easing: slide.cancelEasing,
		});
	});

	it("takes its duration and curve from the platform's motion", () => {
		const macos = stackMotion({ platform: "macos" });
		const { settle, animations } = makeSettle({ motion: macos });
		settle.track(1);

		void settle.settleTo({ target: 0, intent: "commit" });

		expect(animations.at(-1)).toMatchObject({
			from: 1,
			to: 0,
			duration: 250,
			easing: macos.commitEasing,
		});
	});

	it("settles instantly under reduced motion", () => {
		const { settle, animations } = makeSettle({ reducedMotion: true });
		settle.track(0.25);

		void settle.settleTo({ target: 1, intent: "commit" });

		expect(animations.at(-1)).toMatchObject({ duration: 0 });
	});

	it("lands on the target once the settle completes", async () => {
		const { settle, animations } = makeSettle();
		settle.track(0.6);

		const settled = settle.settleTo({ target: 0, intent: "commit" });
		await settleLast(animations);

		expect(await settled).toBe(true);
		expect(settle.progress).toBe(0);
	});

	it("adopts where a stopped settle had reached", async () => {
		const { settle, animations } = makeSettle();

		const settled = settle.settleTo({ target: 1, intent: "commit" });
		animations.at(-1)!.reached = 0.3;
		settle.stop();

		expect(await settled).toBe(false);
		expect(settle.progress).toBe(0.3);
	});

	it("starts a new settle from where the replaced one stopped", () => {
		const { settle, animations } = makeSettle();

		void settle.settleTo({ target: 1, intent: "commit" });
		animations.at(-1)!.reached = 0.7;
		void settle.settleTo({ target: 0, intent: "commit" });

		expect(animations.at(-1)).toMatchObject({ from: 0.7, to: 0 });
	});
});

describe("StackSettle picking up a settle", () => {
	it("lets a settle heading in keep sliding under the finger, which drives the rest of the way out", () => {
		const { settle, applied, animations } = makeSettle();
		settle.progress = 1;
		void settle.settleTo({ target: 0, intent: "commit" });
		const slideIn = animations.at(-1)!;
		slideIn.reached = 0.6;

		settle.pickUp();
		expect(applied.at(-1)).toBe(0.6);

		settle.track(0.5);
		expect(applied.at(-1)).toBeCloseTo(0.8);

		slideIn.reached = 0.2;
		settle.track(0.5);
		expect(applied.at(-1)).toBeCloseTo(0.6);

		slideIn.reached = 0;
		settle.track(0.5);
		expect(applied.at(-1)).toBe(0.5);
		settle.track(1);
		expect(applied.at(-1)).toBe(1);
	});

	it("settles from where the picked-up page is and forgets the slide it picked up", () => {
		const { settle, animations } = makeSettle();
		settle.progress = 1;
		void settle.settleTo({ target: 0, intent: "commit" });
		const slideIn = animations.at(-1)!;
		slideIn.reached = 0.6;
		settle.pickUp();
		settle.track(0.5);

		void settle.settleTo({ target: 1, intent: "commit" });
		expect(animations.at(-1)).toMatchObject({
			from: expect.closeTo(0.8),
			to: 1,
			duration: expect.closeTo(slide.settleMs * 0.2),
		});

		slideIn.reached = 0.4;
		settle.track(0.25);
		expect(settle.progress).toBe(0.25);
	});

	it("starts from fully in when nothing is sliding", () => {
		const { settle, applied } = makeSettle();
		settle.progress = 0.4;

		settle.pickUp();

		expect(settle.settlingIn).toBe(false);
		expect(applied.at(-1)).toBe(0);
	});

	it("drops a settle heading out and starts from fully in", () => {
		const { settle, applied, animations } = makeSettle();
		void settle.settleTo({ target: 1, intent: "commit" });
		animations.at(-1)!.reached = 0.3;

		settle.pickUp();

		expect(settle.settlingIn).toBe(false);
		expect(applied.at(-1)).toBe(0);
		settle.track(0.5);
		expect(applied.at(-1)).toBe(0.5);
	});
});
