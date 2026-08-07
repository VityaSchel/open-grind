import { describe, expect, it } from "vitest";

import { attachOverscrollPull } from "./overscroll-adapter";
import { ARMING_PX, makeModel, NON_ARMING_PX } from "./pull-test-helpers";

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

	it("does not treat spring-back after Safari's lift-time scrollend as a new pull", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10, { finger: true });
		scroll(NON_ARMING_PX, { finger: true });
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
