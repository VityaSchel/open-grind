import { describe, expect, it } from "vitest";

import { COMMIT_EASING, SETTLE_MS } from "./motion";
import { StackSettle } from "./settle";
import { fakeSurface, settleLast } from "./stack-test-helpers";

function makeSettle({ reducedMotion = false } = {}) {
	const { surface, applied, animations } = fakeSurface();
	const settle = new StackSettle({
		surface,
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

		void settle.settleTo({ target: 1, easing: COMMIT_EASING });

		expect(animations.at(-1)).toMatchObject({
			from: 0.25,
			to: 1,
			duration: SETTLE_MS * 0.75,
			easing: COMMIT_EASING,
		});
	});

	it("settles instantly under reduced motion", () => {
		const { settle, animations } = makeSettle({ reducedMotion: true });
		settle.track(0.25);

		void settle.settleTo({ target: 1, easing: COMMIT_EASING });

		expect(animations.at(-1)).toMatchObject({ duration: 0 });
	});

	it("lands on the target once the settle completes", async () => {
		const { settle, animations } = makeSettle();
		settle.track(0.6);

		const settled = settle.settleTo({ target: 0, easing: COMMIT_EASING });
		await settleLast(animations);

		expect(await settled).toBe(true);
		expect(settle.progress).toBe(0);
	});

	it("adopts where a stopped settle had reached", async () => {
		const { settle, animations } = makeSettle();

		const settled = settle.settleTo({ target: 1, easing: COMMIT_EASING });
		animations.at(-1)!.reached = 0.3;
		settle.stop();

		expect(await settled).toBe(false);
		expect(settle.progress).toBe(0.3);
	});

	it("starts a new settle from where the replaced one stopped", () => {
		const { settle, animations } = makeSettle();

		void settle.settleTo({ target: 1, easing: COMMIT_EASING });
		animations.at(-1)!.reached = 0.7;
		void settle.settleTo({ target: 0, easing: COMMIT_EASING });

		expect(animations.at(-1)).toMatchObject({ from: 0.7, to: 0 });
	});
});
