import { afterEach, describe, expect, it, vi } from "vitest";

import { attachOverscrollPull } from "./overscroll-adapter";
import { PullModel } from "./pull-model.svelte";
import { chainAllowsPull } from "./scroll-chain";
import { attachTouchPull } from "./touch-adapter";

const SPACE = 48;
const ARMING_PX = 60;
const NON_ARMING_PX = 20;

function makeModel() {
	const model = new PullModel({ now: () => 0 });
	model.space = SPACE;
	const onTrigger = vi.fn();
	model.onTrigger = onTrigger;
	return { model, onTrigger };
}

function makeScrollable(
	el: HTMLElement,
	{ scrollHeight = 500, clientHeight = 100, scrollTop = 0 } = {},
) {
	el.style.overflowY = "auto";
	Object.defineProperties(el, {
		scrollHeight: { value: scrollHeight, configurable: true },
		clientHeight: { value: clientHeight, configurable: true },
	});
	el.scrollTop = scrollTop;
}

function touchEvent(
	type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
	{ id = 0, x = 0, y = 0 } = {},
) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	const touch = { identifier: id, clientX: x, clientY: y };
	const active = type === "touchstart" || type === "touchmove" ? [touch] : [];
	Object.defineProperties(event, {
		touches: { value: active },
		changedTouches: { value: [touch] },
	});
	return event as unknown as TouchEvent;
}

describe("chainAllowsPull", () => {
	it("allows when no intermediate scroller can consume the pull", () => {
		const root = document.createElement("div");
		const leaf = document.createElement("span");
		root.appendChild(leaf);
		document.body.appendChild(root);
		expect(chainAllowsPull({ start: leaf, root, position: "top" })).toBe(true);
		root.remove();
	});

	it("refuses when a nested scroller is scrolled away from the boundary", () => {
		const root = document.createElement("div");
		const nested = document.createElement("div");
		const leaf = document.createElement("span");
		nested.appendChild(leaf);
		root.appendChild(nested);
		document.body.appendChild(root);
		makeScrollable(nested, { scrollTop: 50 });
		expect(chainAllowsPull({ start: leaf, root, position: "top" })).toBe(false);
		nested.scrollTop = 0;
		expect(chainAllowsPull({ start: leaf, root, position: "top" })).toBe(true);
		expect(chainAllowsPull({ start: leaf, root, position: "bottom" })).toBe(
			false,
		);
		nested.scrollTop = 399;
		expect(chainAllowsPull({ start: leaf, root, position: "bottom" })).toBe(
			true,
		);
		root.remove();
	});

	it("refuses targets outside the root", () => {
		const root = document.createElement("div");
		const stranger = document.createElement("div");
		document.body.append(root, stranger);
		expect(chainAllowsPull({ start: stranger, root, position: "top" })).toBe(
			false,
		);
		root.remove();
		stranger.remove();
	});

	it("refuses while the root is scroll-locked", () => {
		const root = document.createElement("div");
		const leaf = document.createElement("span");
		root.appendChild(leaf);
		document.body.appendChild(root);
		makeScrollable(root);
		expect(chainAllowsPull({ start: leaf, root, position: "top" })).toBe(true);
		root.style.overflowY = "hidden";
		expect(chainAllowsPull({ start: leaf, root, position: "top" })).toBe(false);
		root.remove();
	});

	it("refuses document pulls while the body is scroll-locked", () => {
		const leaf = document.createElement("span");
		document.body.appendChild(leaf);
		expect(
			chainAllowsPull({
				start: leaf,
				root: document.documentElement,
				position: "top",
			}),
		).toBe(true);
		document.body.style.overflow = "hidden";
		expect(
			chainAllowsPull({
				start: leaf,
				root: document.documentElement,
				position: "top",
			}),
		).toBe(false);
		document.body.style.overflow = "";
		leaf.remove();
	});
});

describe("attachTouchPull", () => {
	function setup({
		boundary = 0,
		position = "top",
	}: { boundary?: number; position?: "top" | "bottom" } = {}) {
		const { model, onTrigger } = makeModel();
		const root = document.createElement("div");
		const leaf = document.createElement("span");
		root.appendChild(leaf);
		document.body.appendChild(root);
		const detach = attachTouchPull(model, {
			listenTarget: root,
			scrollRoot: () => root,
			boundaryDistance: () => boundary,
			position,
		});
		return { model, onTrigger, root, leaf, detach };
	}

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("engages after slop, owns the gesture, arms and triggers on release", () => {
		const { model, onTrigger, leaf, detach } = setup();
		leaf.dispatchEvent(touchEvent("touchstart", { y: 100 }));
		leaf.dispatchEvent(touchEvent("touchmove", { y: 104 }));
		expect(model.phase).toBe("idle");

		const move = touchEvent("touchmove", { y: 140 });
		const prevent = vi.spyOn(move, "preventDefault");
		leaf.dispatchEvent(move);
		expect(model.phase).toBe("pulling");
		expect(model.source).toBe("touch");
		expect(prevent).toHaveBeenCalled();
		expect(model.displayPx).toBeGreaterThan(0);

		leaf.dispatchEvent(touchEvent("touchmove", { y: 260 }));
		expect(model.phase).toBe("armed");

		leaf.dispatchEvent(touchEvent("touchend", { y: 260 }));
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("snaps back when released below the threshold", () => {
		const { model, onTrigger, leaf, detach } = setup();
		leaf.dispatchEvent(touchEvent("touchstart", { y: 100 }));
		leaf.dispatchEvent(touchEvent("touchmove", { y: 130 }));
		expect(model.phase).toBe("pulling");
		leaf.dispatchEvent(touchEvent("touchend", { y: 130 }));
		expect(model.phase).toBe("idle");
		expect(model.settledOutcome).toBe("canceled");
		expect(onTrigger).not.toHaveBeenCalled();
		detach();
	});

	it("stays dead for predominantly horizontal gestures", () => {
		const { model, leaf, detach } = setup();
		leaf.dispatchEvent(touchEvent("touchstart", { x: 0, y: 100 }));
		leaf.dispatchEvent(touchEvent("touchmove", { x: 60, y: 120 }));
		expect(model.phase).toBe("idle");
		leaf.dispatchEvent(touchEvent("touchmove", { x: 60, y: 300 }));
		expect(model.phase).toBe("idle");
		detach();
	});

	it("does not engage away from the boundary", () => {
		const { model, leaf, detach } = setup({ boundary: 50 });
		leaf.dispatchEvent(touchEvent("touchstart", { y: 100 }));
		leaf.dispatchEvent(touchEvent("touchmove", { y: 200 }));
		expect(model.phase).toBe("idle");
		detach();
	});

	it("engages mid-gesture once native scroll reaches the boundary", () => {
		const { model } = makeModel();
		const root = document.createElement("div");
		const leaf = document.createElement("span");
		root.appendChild(leaf);
		document.body.appendChild(root);
		let boundary = 40;
		const detach = attachTouchPull(model, {
			listenTarget: root,
			scrollRoot: () => root,
			boundaryDistance: () => boundary,
			position: "top",
		});
		leaf.dispatchEvent(touchEvent("touchstart", { y: 100 }));
		leaf.dispatchEvent(touchEvent("touchmove", { y: 140 }));
		expect(model.phase).toBe("idle");
		boundary = 0;
		leaf.dispatchEvent(touchEvent("touchmove", { y: 145 }));
		expect(model.phase).toBe("idle");
		leaf.dispatchEvent(touchEvent("touchmove", { y: 190 }));
		expect(model.phase).toBe("pulling");
		expect(model.displayPx).toBeGreaterThan(0);
		leaf.dispatchEvent(touchEvent("touchend", { y: 190 }));
		expect(model.phase).toBe("idle");
		detach();
	});

	it("does not engage when a nested scroller owns the scroll", () => {
		const { model, root, leaf, detach } = setup();
		const nested = document.createElement("div");
		root.insertBefore(nested, leaf);
		nested.appendChild(leaf);
		makeScrollable(nested, { scrollTop: 50 });
		leaf.dispatchEvent(touchEvent("touchstart", { y: 100 }));
		leaf.dispatchEvent(touchEvent("touchmove", { y: 200 }));
		expect(model.phase).toBe("idle");
		detach();
	});

	it("aborts when the container scrolls away under an engaged pull", () => {
		const { model, onTrigger } = makeModel();
		const root = document.createElement("div");
		const leaf = document.createElement("span");
		root.appendChild(leaf);
		document.body.appendChild(root);
		let boundary = 0;
		const detach = attachTouchPull(model, {
			listenTarget: root,
			scrollRoot: () => root,
			boundaryDistance: () => boundary,
			position: "top",
		});
		leaf.dispatchEvent(touchEvent("touchstart", { y: 100 }));
		leaf.dispatchEvent(touchEvent("touchmove", { y: 260 }));
		expect(model.phase).toBe("armed");
		boundary = 60;
		root.dispatchEvent(new Event("scroll"));
		expect(model.phase).toBe("idle");
		expect(model.settledOutcome).toBe("canceled");
		leaf.dispatchEvent(touchEvent("touchmove", { y: 320 }));
		expect(model.phase).toBe("idle");
		leaf.dispatchEvent(touchEvent("touchend", { y: 320 }));
		expect(onTrigger).not.toHaveBeenCalled();
		detach();
	});

	it("owns every finger's moves while a pull is engaged", () => {
		const { model, leaf, detach } = setup();
		leaf.dispatchEvent(touchEvent("touchstart", { id: 0, y: 100 }));
		leaf.dispatchEvent(touchEvent("touchmove", { id: 0, y: 200 }));
		expect(model.gestureActive).toBe(true);
		const secondFingerMove = touchEvent("touchmove", { id: 1, y: 400 });
		const prevent = vi.spyOn(secondFingerMove, "preventDefault");
		leaf.dispatchEvent(secondFingerMove);
		expect(prevent).toHaveBeenCalled();
		detach();
	});

	it("cancels the gesture on touchcancel", () => {
		const { model, onTrigger, leaf, detach } = setup();
		leaf.dispatchEvent(touchEvent("touchstart", { y: 100 }));
		leaf.dispatchEvent(touchEvent("touchmove", { y: 260 }));
		expect(model.phase).toBe("armed");
		leaf.dispatchEvent(touchEvent("touchcancel", { y: 260 }));
		expect(model.phase).toBe("idle");
		expect(onTrigger).not.toHaveBeenCalled();
		detach();
	});

	it("recovers when a tracked touchend never arrives (pressed node detached mid-pull)", () => {
		const { model, onTrigger, root, leaf, detach } = setup();
		leaf.dispatchEvent(touchEvent("touchstart", { id: 0, y: 100 }));
		leaf.dispatchEvent(touchEvent("touchmove", { id: 0, y: 200 }));
		expect(model.gestureActive).toBe(true);
		// The node under the finger gets removed mid-pull. Its touchend fires on
		// that node instead of the container, so we never see the release.
		const start2 = touchEvent("touchstart", { id: 7, y: 300 });
		root.dispatchEvent(start2);
		expect(model.gestureActive).toBe(false);
		const move2 = touchEvent("touchmove", { id: 7, y: 250 });
		const prevent = vi.spyOn(move2, "preventDefault");
		root.dispatchEvent(move2);
		expect(prevent).not.toHaveBeenCalled();
		root.dispatchEvent(touchEvent("touchstart", { id: 8, y: 100 }));
		root.dispatchEvent(touchEvent("touchmove", { id: 8, y: 260 }));
		expect(model.phase).toBe("armed");
		root.dispatchEvent(touchEvent("touchend", { id: 8, y: 260 }));
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("pulls upward for bottom position", () => {
		const { model, onTrigger, leaf, detach } = setup({ position: "bottom" });
		leaf.dispatchEvent(touchEvent("touchstart", { y: 300 }));
		leaf.dispatchEvent(touchEvent("touchmove", { y: 140 }));
		expect(model.phase).toBe("armed");
		leaf.dispatchEvent(touchEvent("touchend", { y: 140 }));
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});
});

describe("attachOverscrollPull", () => {
	function setup() {
		const { model, onTrigger } = makeModel();
		const target = document.createElement("div");
		let over = 0;
		let clock = 0;
		const detach = attachOverscrollPull(model, {
			listenTarget: target,
			overscrollPx: () => over,
			now: () => clock,
		});
		const scroll = (
			px: number,
			{
				advance = 16,
				finger = false,
			}: { advance?: number; finger?: boolean } = {},
		) => {
			clock += advance;
			if (finger) target.dispatchEvent(new Event("wheel"));
			over = px;
			target.dispatchEvent(new Event("scroll"));
		};
		const scrollEnd = () => target.dispatchEvent(new Event("scrollend"));
		const settleMidList = () => {
			scroll(-200);
			scrollEnd();
		};
		return { model, onTrigger, scroll, scrollEnd, settleMidList, detach };
	}

	it("mirrors the band without extra resistance", () => {
		const { model, scroll, detach } = setup();
		scroll(10);
		expect(model.phase).toBe("pulling");
		expect(model.source).toBe("overscroll");
		expect(model.displayPx).toBe(10);
		detach();
	});

	it("holds while the band is stretched and does not fire until scrollend", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10);
		scroll(ARMING_PX);
		expect(model.phase).toBe("armed");
		expect(onTrigger).not.toHaveBeenCalled();
		scroll(NON_ARMING_PX);
		scroll(0);
		expect(onTrigger).not.toHaveBeenCalled();
		scrollEnd();
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("cancels on scrollend when the band never armed", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10);
		scroll(NON_ARMING_PX);
		scroll(0);
		scrollEnd();
		expect(model.phase).toBe("idle");
		expect(model.settledOutcome).toBe("canceled");
		expect(onTrigger).not.toHaveBeenCalled();
		detach();
	});

	it("without wheel events falls back to peak-armed (fires if ever armed)", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10);
		scroll(ARMING_PX);
		scroll(NON_ARMING_PX);
		expect(model.phase).toBe("pulling");
		scrollEnd();
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("aborts when the fingers ease the band below the threshold before lifting", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10, { finger: true });
		scroll(ARMING_PX, { finger: true });
		expect(model.phase).toBe("armed");
		scroll(NON_ARMING_PX, { finger: true });
		expect(model.phase).toBe("pulling");
		scrollEnd();
		expect(model.phase).toBe("idle");
		expect(model.settledOutcome).toBe("canceled");
		expect(onTrigger).not.toHaveBeenCalled();
		detach();
	});

	it("fires when lifted while armed even as the spring-back collapses the band", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10, { finger: true });
		scroll(ARMING_PX, { finger: true });
		scroll(30, { advance: 200 });
		scroll(0, { advance: 16 });
		scrollEnd();
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("suppresses a momentum band (fast approach) until it settles", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(-90);
		scroll(-40);
		scroll(20);
		expect(model.phase).toBe("idle");
		scroll(ARMING_PX);
		scroll(0);
		scrollEnd();
		expect(model.phase).toBe("idle");
		expect(onTrigger).not.toHaveBeenCalled();
		scroll(0, { advance: 300 });
		scroll(8);
		scroll(ARMING_PX);
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("ignores a band from a gesture that began away from the boundary", () => {
		const { model, onTrigger, scroll, scrollEnd, settleMidList, detach } =
			setup();
		settleMidList();
		scroll(-140, { advance: 100, finger: true });
		scroll(-80, { advance: 100, finger: true });
		scroll(-20, { advance: 100, finger: true });
		scroll(30, { advance: 100, finger: true });
		expect(model.phase).toBe("idle");
		scroll(ARMING_PX, { advance: 100, finger: true });
		scroll(0, { advance: 100 });
		scrollEnd();
		expect(model.phase).toBe("idle");
		expect(onTrigger).not.toHaveBeenCalled();
		scroll(10, { advance: 100, finger: true });
		scroll(ARMING_PX, { advance: 100, finger: true });
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("recovers the resting position across a quiet gap after a wheel-less jump", () => {
		const { model, onTrigger, scroll, scrollEnd, settleMidList, detach } =
			setup();
		settleMidList();
		scroll(-100, { advance: 50 });
		scroll(0, { advance: 50 });
		scroll(10, { advance: 400, finger: true });
		scroll(ARMING_PX, { advance: 50, finger: true });
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("does not treat a stationary-finger pause as a new gesture", () => {
		const { model, onTrigger, scroll, scrollEnd, settleMidList, detach } =
			setup();
		settleMidList();
		scroll(-100, { advance: 50, finger: true });
		scroll(0, { advance: 50, finger: true });
		scroll(10, { advance: 400, finger: true });
		scroll(ARMING_PX, { advance: 50, finger: true });
		expect(model.phase).toBe("idle");
		scroll(0, { advance: 16 });
		scrollEnd();
		expect(onTrigger).not.toHaveBeenCalled();
		scroll(10, { advance: 100, finger: true });
		scroll(ARMING_PX, { advance: 50, finger: true });
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("cancels the pull the moment the gesture reverses into a real scroll", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10, { finger: true });
		scroll(ARMING_PX, { finger: true });
		expect(model.phase).toBe("armed");
		scroll(-30, { finger: true });
		expect(model.phase).toBe("idle");
		expect(model.settledOutcome).toBe("canceled");
		scroll(40, { finger: true });
		expect(model.phase).toBe("idle");
		scroll(0, { finger: true });
		scrollEnd();
		expect(onTrigger).not.toHaveBeenCalled();
		scroll(10, { advance: 100, finger: true });
		scroll(ARMING_PX, { advance: 100, finger: true });
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("does not treat post-release spring-back as a new pull", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10, { finger: true });
		scroll(NON_ARMING_PX, { finger: true });
		// Safari fires scrollend when you lift, before the band springs back.
		scrollEnd();
		expect(model.phase).toBe("idle");
		scroll(14);
		scroll(6);
		scroll(0);
		expect(model.phase).toBe("idle");
		expect(model.source).toBe(null);
		expect(onTrigger).not.toHaveBeenCalled();
		detach();
	});

	it("heals a wheel-tainted at-boundary state after aborts whose scrollends were skipped", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		const abortedPullLiftedWithBandLeft = () => {
			scroll(10, { finger: true });
			scroll(ARMING_PX, { finger: true });
			scroll(8, { finger: true });
			scrollEnd();
		};
		const wheelLessSpringWithoutClosingScrollEnd = () => {
			scroll(4, { advance: 16 });
			scroll(0, { advance: 16 });
		};
		const retryEatenBySpringEndingAtNetZero = () => {
			scroll(10, { advance: 100, finger: true });
			scroll(30, { finger: true });
			scroll(0, { finger: true });
		};

		abortedPullLiftedWithBandLeft();
		expect(model.settledOutcome).toBe("canceled");
		wheelLessSpringWithoutClosingScrollEnd();
		retryEatenBySpringEndingAtNetZero();

		scroll(10, { advance: 400, finger: true });
		scroll(ARMING_PX, { finger: true });
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("never pulls when one gesture wanders off the boundary and returns", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(-40, { advance: 100, finger: true });
		scroll(-10, { advance: 100, finger: true });
		scroll(20, { advance: 100, finger: true });
		scroll(ARMING_PX, { advance: 100, finger: true });
		expect(model.phase).toBe("idle");
		scroll(0, { advance: 100 });
		scrollEnd();
		expect(model.phase).toBe("idle");
		expect(onTrigger).not.toHaveBeenCalled();
		detach();
	});

	it("defers to an active touch gesture", () => {
		const { model, scroll, detach } = setup();
		model.beginPull("touch");
		model.updatePull(30);
		const before = model.displayPx;
		scroll(25);
		expect(model.source).toBe("touch");
		expect(model.displayPx).toBe(before);
		detach();
	});

	it("pulls for bottom position via the same overscroll magnitude", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10);
		scroll(ARMING_PX);
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});
});
