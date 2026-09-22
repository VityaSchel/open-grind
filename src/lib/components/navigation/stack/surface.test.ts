import { describe, expect, it, vi } from "vitest";

import { paneSurface } from "./surface";

function paneAt(easedProgress: number | null) {
	const pane = document.createElement("div");
	const animation = {
		finished: new Promise<never>(() => {}),
		cancel: vi.fn(),
		effect: { getComputedTiming: () => ({ progress: easedProgress }) },
	};
	pane.animate = vi.fn(() => animation as unknown as Animation);
	return { pane, animation };
}

function surfaceOver({
	front,
	back,
}: {
	front: HTMLElement;
	back: HTMLElement;
}) {
	return paneSurface({
		panes: () => ({ front, back, dim: null }),
		parallax: () => true,
	});
}

describe("paneSurface", () => {
	it("stops a running settle where its eased progress had reached", () => {
		const front = paneAt(0.25);
		const back = paneAt(0.25);
		const running = surfaceOver({
			front: front.pane,
			back: back.pane,
		}).animate({ from: 1, to: 0, duration: 540, easing: "linear" });

		expect(running.cancel()).toBe(0.75);
		expect(front.animation.cancel).toHaveBeenCalledOnce();
		expect(back.animation.cancel).toHaveBeenCalledOnce();
	});

	it("reports the target when the settle has no progress to read", () => {
		const running = surfaceOver({
			front: paneAt(null).pane,
			back: paneAt(null).pane,
		}).animate({ from: 0, to: 1, duration: 540, easing: "linear" });

		expect(running.cancel()).toBe(1);
	});

	it("applies an instant settle right away and reports its target", async () => {
		const front = document.createElement("div");
		const running = surfaceOver({
			front,
			back: document.createElement("div"),
		}).animate({ from: 1, to: 0, duration: 0, easing: "linear" });

		expect(front.style.transform).toBe("translate3d(0.000%,0,0)");
		expect(await running.completed).toBe(true);
		expect(running.cancel()).toBe(0);
	});
});
