import { describe, expect, it, vi } from "vitest";

import { attachOverscrollPull } from "./overscroll-adapter";
import {
	ARMING_PX,
	makeModel,
	NON_ARMING_PX,
	touchEvent,
} from "./pull-test-helpers";

describe("attachOverscrollPull", () => {
	function setup() {
		const { model, onTrigger } = makeModel();
		const target = document.createElement("div");
		const onWheelOrTouchBand = vi.fn();
		const onBandWithoutWheelOrTouch = vi.fn();
		let over = 0;
		let clock = 0;
		const detach = attachOverscrollPull(model, {
			listenTarget: target,
			overscrollPx: () => over,
			now: () => clock,
			onWheelOrTouchBand,
			onBandWithoutWheelOrTouch,
		});
		const wheel = () => target.dispatchEvent(new Event("wheel"));
		const scroll = (
			px: number,
			{
				advance = 16,
				finger = true,
			}: { advance?: number; finger?: boolean } = {},
		) => {
			clock += advance;
			if (finger) wheel();
			over = px;
			target.dispatchEvent(new Event("scroll"));
		};
		const scrollEnd = () => target.dispatchEvent(new Event("scrollend"));
		const touch = (type: "touchstart" | "touchend") =>
			target.dispatchEvent(touchEvent(type));
		const settleMidList = () => {
			scroll(-200);
			scrollEnd();
		};
		return {
			model,
			onTrigger,
			onWheelOrTouchBand,
			onBandWithoutWheelOrTouch,
			wheel,
			scroll,
			scrollEnd,
			touch,
			settleMidList,
			detach,
		};
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
		scroll(NON_ARMING_PX, { finger: false });
		scroll(0, { finger: false });
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

	it("pulls a touch-held band that carries no wheels and fires if it ever armed", () => {
		const { model, onTrigger, scroll, scrollEnd, touch, detach } = setup();
		touch("touchstart");
		scroll(10, { finger: false });
		expect(model.phase).toBe("pulling");
		scroll(ARMING_PX, { finger: false });
		scroll(NON_ARMING_PX, { finger: false });
		expect(model.phase).toBe("pulling");
		touch("touchend");
		scrollEnd();
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("stops counting a touch once the last finger lifts", () => {
		const { model, onBandWithoutWheelOrTouch, scroll, touch, detach } =
			setup();
		touch("touchstart");
		touch("touchend");
		scroll(10, { finger: false });
		expect(model.phase).toBe("idle");
		expect(onBandWithoutWheelOrTouch).toHaveBeenCalledOnce();
		detach();
	});

	it("never pulls, arms or fires on a band that no wheel and no touch drives, and reports it", () => {
		const {
			model,
			onTrigger,
			onWheelOrTouchBand,
			onBandWithoutWheelOrTouch,
			scroll,
			scrollEnd,
			detach,
		} = setup();
		scroll(6, { finger: false });
		expect(model.phase).toBe("idle");
		expect(onBandWithoutWheelOrTouch).toHaveBeenCalledOnce();
		scroll(ARMING_PX, { advance: 100, finger: false });
		expect(model.phase).toBe("idle");
		expect(model.source).toBe(null);
		scroll(0, { finger: false });
		scrollEnd();
		expect(model.phase).toBe("idle");
		expect(onTrigger).not.toHaveBeenCalled();
		expect(onWheelOrTouchBand).not.toHaveBeenCalled();
		detach();
	});

	it("reports a band that no wheel or touch drives only once it is deep enough to be a band", () => {
		const { onBandWithoutWheelOrTouch, scroll, detach } = setup();
		scroll(1.5, { finger: false });
		expect(onBandWithoutWheelOrTouch).not.toHaveBeenCalled();
		scroll(3, { advance: 100, finger: false });
		expect(onBandWithoutWheelOrTouch).toHaveBeenCalledOnce();
		detach();
	});

	it("lets a wheel that arrives a frame late still claim the band as a pull", () => {
		const {
			model,
			onWheelOrTouchBand,
			onBandWithoutWheelOrTouch,
			scroll,
			detach,
		} = setup();
		scroll(3, { finger: false });
		expect(model.phase).toBe("idle");
		expect(onBandWithoutWheelOrTouch).toHaveBeenCalledOnce();
		expect(onWheelOrTouchBand).not.toHaveBeenCalled();
		scroll(10);
		expect(model.phase).toBe("pulling");
		expect(onWheelOrTouchBand).toHaveBeenCalledOnce();
		expect(onBandWithoutWheelOrTouch).toHaveBeenCalledOnce();
		detach();
	});

	it("does not count a wheel that moved nothing long before the band", () => {
		const {
			model,
			onWheelOrTouchBand,
			onBandWithoutWheelOrTouch,
			wheel,
			scroll,
			detach,
		} = setup();
		wheel();
		scroll(6, { advance: 1000, finger: false });
		expect(model.phase).toBe("idle");
		expect(onBandWithoutWheelOrTouch).toHaveBeenCalledOnce();
		expect(onWheelOrTouchBand).not.toHaveBeenCalled();
		detach();
	});

	it("reports a wheel-driven band even when the gesture is no pull", () => {
		const {
			model,
			onWheelOrTouchBand,
			onBandWithoutWheelOrTouch,
			scroll,
			settleMidList,
			detach,
		} = setup();
		settleMidList();
		scroll(-20, { advance: 100 });
		scroll(30, { advance: 100 });
		expect(model.phase).toBe("idle");
		expect(onWheelOrTouchBand).toHaveBeenCalledOnce();
		expect(onBandWithoutWheelOrTouch).not.toHaveBeenCalled();
		detach();
	});

	it("aborts when the fingers ease the band below the threshold before lifting", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10);
		scroll(ARMING_PX);
		expect(model.phase).toBe("armed");
		scroll(NON_ARMING_PX);
		expect(model.phase).toBe("pulling");
		scrollEnd();
		expect(model.phase).toBe("idle");
		expect(model.settledOutcome).toBe("canceled");
		expect(onTrigger).not.toHaveBeenCalled();
		detach();
	});

	it("fires when lifted while armed even as the spring-back collapses the band", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10);
		scroll(ARMING_PX);
		scroll(30, { advance: 200, finger: false });
		scroll(0, { finger: false });
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
		scroll(-140, { advance: 100 });
		scroll(-80, { advance: 100 });
		scroll(-20, { advance: 100 });
		scroll(30, { advance: 100 });
		expect(model.phase).toBe("idle");
		scroll(ARMING_PX, { advance: 100 });
		scroll(0, { advance: 100, finger: false });
		scrollEnd();
		expect(model.phase).toBe("idle");
		expect(onTrigger).not.toHaveBeenCalled();
		scroll(10, { advance: 100 });
		scroll(ARMING_PX, { advance: 100 });
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("recovers the resting position across a quiet gap after a wheel-less jump", () => {
		const { model, onTrigger, scroll, scrollEnd, settleMidList, detach } =
			setup();
		settleMidList();
		scroll(-100, { advance: 50, finger: false });
		scroll(0, { advance: 50, finger: false });
		scroll(10, { advance: 400 });
		scroll(ARMING_PX, { advance: 50 });
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("does not treat a stationary-finger pause as a new gesture", () => {
		const { model, onTrigger, scroll, scrollEnd, settleMidList, detach } =
			setup();
		settleMidList();
		scroll(-100, { advance: 50 });
		scroll(0, { advance: 50 });
		scroll(10, { advance: 400 });
		scroll(ARMING_PX, { advance: 50 });
		expect(model.phase).toBe("idle");
		scroll(0, { finger: false });
		scrollEnd();
		expect(onTrigger).not.toHaveBeenCalled();
		scroll(10, { advance: 100 });
		scroll(ARMING_PX, { advance: 50 });
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("cancels the pull the moment the gesture reverses into a real scroll", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(10);
		scroll(ARMING_PX);
		expect(model.phase).toBe("armed");
		scroll(-30);
		expect(model.phase).toBe("idle");
		expect(model.settledOutcome).toBe("canceled");
		scroll(40);
		expect(model.phase).toBe("idle");
		scroll(0);
		scrollEnd();
		expect(onTrigger).not.toHaveBeenCalled();
		scroll(10, { advance: 100 });
		scroll(ARMING_PX, { advance: 100 });
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("does not treat spring-back after Safari's lift-time scrollend as a new pull", () => {
		const {
			model,
			onTrigger,
			onBandWithoutWheelOrTouch,
			scroll,
			scrollEnd,
			detach,
		} = setup();
		scroll(10);
		scroll(NON_ARMING_PX);
		scrollEnd();
		expect(model.phase).toBe("idle");
		scroll(14, { finger: false });
		scroll(6, { finger: false });
		scroll(0, { finger: false });
		expect(model.phase).toBe("idle");
		expect(model.source).toBe(null);
		expect(onTrigger).not.toHaveBeenCalled();
		expect(onBandWithoutWheelOrTouch).not.toHaveBeenCalled();
		detach();
	});

	it("heals a wheel-tainted at-boundary state after aborts whose scrollends were skipped", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		const abortedPullLiftedWithBandLeft = () => {
			scroll(10);
			scroll(ARMING_PX);
			scroll(8);
			scrollEnd();
		};
		const wheelLessSpringWithoutClosingScrollEnd = () => {
			scroll(4, { finger: false });
			scroll(0, { finger: false });
		};
		const retryEatenBySpringEndingAtNetZero = () => {
			scroll(10, { advance: 100 });
			scroll(30);
			scroll(0);
		};

		abortedPullLiftedWithBandLeft();
		expect(model.settledOutcome).toBe("canceled");
		wheelLessSpringWithoutClosingScrollEnd();
		retryEatenBySpringEndingAtNetZero();

		scroll(10, { advance: 400 });
		scroll(ARMING_PX);
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
		detach();
	});

	it("never pulls when one gesture wanders off the boundary and returns", () => {
		const { model, onTrigger, scroll, scrollEnd, detach } = setup();
		scroll(-40, { advance: 100 });
		scroll(-10, { advance: 100 });
		scroll(20, { advance: 100 });
		scroll(ARMING_PX, { advance: 100 });
		expect(model.phase).toBe("idle");
		scroll(0, { advance: 100, finger: false });
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
