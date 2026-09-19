import { describe, expect, it } from "vitest";

import {
	type ScrollGesturePhase,
	ScrollGestureState,
} from "$lib/platform/scroll-gesture";

describe("ScrollGestureState.onPhaseChange", () => {
	it("reports each transition of a flick once, the release included", () => {
		const gesture = new ScrollGestureState();
		const phases: ScrollGesturePhase[] = [];
		gesture.onPhaseChange((phase) => phases.push(phase));

		gesture.ingest({ state: "fingers", dx: 0, dy: 0 });
		gesture.ingest({ dx: 4, dy: 1 });
		gesture.ingest({ state: "released" });
		gesture.ingest({ state: "momentum" });
		gesture.ingest({ state: "momentum" });
		gesture.ingest({ state: "idle" });

		expect(phases).toEqual(["fingers", "idle", "momentum", "idle"]);
	});

	it("stays silent for a release that changes nothing", () => {
		const gesture = new ScrollGestureState();
		const phases: ScrollGesturePhase[] = [];
		gesture.onPhaseChange((phase) => phases.push(phase));

		gesture.ingest({ state: "released" });
		gesture.ingest({ state: "idle" });

		expect(phases).toEqual([]);
	});

	it("stops reporting once unsubscribed", () => {
		const gesture = new ScrollGestureState();
		const phases: ScrollGesturePhase[] = [];
		const unsubscribe = gesture.onPhaseChange((phase) =>
			phases.push(phase),
		);

		gesture.ingest({ state: "fingers", dx: 0, dy: 0 });
		unsubscribe();
		gesture.ingest({ state: "released" });

		expect(phases).toEqual(["fingers"]);
		expect(gesture.phase).toBe("idle");
	});
});
