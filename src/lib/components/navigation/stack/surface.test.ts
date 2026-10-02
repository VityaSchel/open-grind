import { describe, expect, it, vi } from "vitest";

import { type StackMotion, stackMotion } from "./motion";
import { paneSurface } from "./surface";

const slide = stackMotion({ platform: "android" });
const windows = stackMotion({ platform: "windows" });

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
	const animate = vi.fn(() => animation as unknown as Animation);
	pane.animate = animate;
	return { pane, animate, animation, timing, finish: () => finish() };
}

function surfaceOver({
	front,
	back,
	motion = slide,
}: {
	front: HTMLElement;
	back: HTMLElement;
	motion?: StackMotion;
}) {
	return paneSurface({
		panes: () => ({ front, back, dim: null }),
		parallax: () => true,
		motion,
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

	it("runs the scrim from clear to full opacity as a pane covers the one behind", () => {
		const dim = paneAt(0);
		const surface = paneSurface({
			panes: () => ({ front: null, back: null, dim: dim.pane }),
			parallax: () => true,
			motion: slide,
		});

		surface.apply(0.25);
		expect(dim.pane.style.opacity).toBe("0.75");

		surface.animate({ from: 1, to: 0, duration: 540, easing: "linear" });
		expect(dim.animate).toHaveBeenCalledWith(
			[{ opacity: 0 }, { opacity: 1 }],
			expect.objectContaining({ duration: 540 }),
		);
	});

	it("slides the panes without touching their opacity on phones", () => {
		const front = paneAt(0);
		const back = paneAt(0);
		const surface = surfaceOver({ front: front.pane, back: back.pane });

		surface.apply(0.5);
		expect(front.pane.style.transform).toBe("translate3d(50.000%,0,0)");
		expect(front.pane.style.opacity).toBe("");
		expect(back.pane.style.opacity).toBe("");

		surface.animate({ from: 1, to: 0, duration: 540, easing: "linear" });
		expect(front.animate).toHaveBeenCalledWith(
			[
				{ transform: "translate3d(100.000%,0,0)" },
				{ transform: "translate3d(0.000%,0,0)" },
			],
			expect.objectContaining({ duration: 540 }),
		);
	});

	it("fades the front pane in as it travels on a fading platform, animating no opacity on the pane behind", () => {
		const front = paneAt(0);
		const back = paneAt(0);
		const surface = surfaceOver({
			front: front.pane,
			back: back.pane,
			motion: windows,
		});

		surface.apply(0.5);
		expect(front.pane.style.transform).toBe("translate3d(20.000px,0,0)");
		expect(Number(front.pane.style.opacity)).toBe(0.5);

		surface.animate({ from: 1, to: 0, duration: 300, easing: "linear" });
		expect(front.animate).toHaveBeenCalledWith(
			[
				{ transform: "translate3d(40.000px,0,0)", opacity: "0.000" },
				{ transform: "translate3d(0.000px,0,0)", opacity: "1.000" },
			],
			expect.objectContaining({ duration: 300 }),
		);
		expect(back.animate).toHaveBeenCalledWith(
			[
				{ transform: "translate3d(0.000%,0,0)" },
				{ transform: "translate3d(0.000%,0,0)" },
			],
			expect.anything(),
		);
	});

	it("shows a pane in full once it is the one behind, even if it was mid-fade as the front pane", () => {
		const pane = document.createElement("div");
		const other = document.createElement("div");
		surfaceOver({ front: pane, back: other, motion: windows }).apply(1);
		expect(Number(pane.style.opacity)).toBe(0);

		surfaceOver({ front: other, back: pane, motion: windows }).apply(0);

		expect(pane.style.opacity).toBe("1");
		expect(pane.style.transform).toBe("translate3d(0.000%,0,0)");
	});

	it("leaves the scrim clear on a fading platform", () => {
		const dim = paneAt(0);
		const surface = paneSurface({
			panes: () => ({ front: null, back: null, dim: dim.pane }),
			parallax: () => true,
			motion: windows,
		});

		surface.apply(0.25);
		expect(dim.pane.style.opacity).toBe("0");

		surface.animate({ from: 1, to: 0, duration: 300, easing: "linear" });
		expect(dim.animate).toHaveBeenCalledWith(
			[{ opacity: 0 }, { opacity: 0 }],
			expect.anything(),
		);
	});
});
