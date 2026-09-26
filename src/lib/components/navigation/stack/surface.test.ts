import { describe, expect, it, vi } from "vitest";

import { paneSurface } from "./surface";

function paneAt(easedProgress: number | null) {
	const pane = document.createElement("div");
	const timing = { progress: easedProgress };
	let finish!: () => void;
	const animation = {
		finished: new Promise<void>((resolve) => {
			finish = resolve;
		}),
		cancel: vi.fn(),
		effect: {
			target: pane as Element | null,
			getComputedTiming: () => timing,
		},
	};
	pane.animate = vi.fn(() => animation as unknown as Animation);
	return { pane, animation, timing, finish: () => finish() };
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

	it("hands over a running settle's clock without letting it move the panes", () => {
		const front = paneAt(0.25);
		const back = paneAt(0.25);
		const running = surfaceOver({
			front: front.pane,
			back: back.pane,
		}).animate({ from: 1, to: 0, duration: 540, easing: "linear" });

		const reached = running.detach();

		expect(front.animation.effect.target).toBeNull();
		expect(front.animation.cancel).not.toHaveBeenCalled();
		expect(back.animation.cancel).toHaveBeenCalledOnce();
		expect(reached()).toBe(0.75);
		front.timing.progress = 0.5;
		expect(reached()).toBe(0.5);
		front.timing.progress = null;
		expect(reached()).toBe(0);
	});

	it("lets a handed-over clock run out without reporting a finished settle or moving the panes", async () => {
		const front = paneAt(0.25);
		const back = paneAt(0.25);
		const running = surfaceOver({
			front: front.pane,
			back: back.pane,
		}).animate({ from: 1, to: 0, duration: 540, easing: "linear" });
		running.detach();

		front.finish();
		back.finish();

		expect(await running.completed).toBe(false);
		expect(front.pane.style.transform).toBe("");
		expect(back.pane.style.transform).toBe("");
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
		expect(running.detach()()).toBe(0);
	});
});
