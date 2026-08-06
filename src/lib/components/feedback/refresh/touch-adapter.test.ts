import { afterEach, describe, expect, it, vi } from "vitest";

import { makeModel, makeScrollable, touchEvent } from "./pull-test-helpers";
import { attachTouchPull } from "./touch-adapter";

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
		const { model, onTrigger, leaf, detach } = setup({
			position: "bottom",
		});
		leaf.dispatchEvent(touchEvent("touchstart", { y: 300 }));
		leaf.dispatchEvent(touchEvent("touchmove", { y: 140 }));
		expect(model.phase).toBe("armed");
		leaf.dispatchEvent(touchEvent("touchend", { y: 140 }));
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});
});
