import { afterEach, describe, expect, it, vi } from "vitest";

import { attachOverscrollPull } from "./overscroll-adapter";
import {
	ARMING_PX,
	makeModel,
	makeScrollable,
	NON_ARMING_PX,
} from "./pull-test-helpers";
import { scrollGeometry } from "./scroll-geometry";

const KEY_BAND_WINDOW_MS = 500;

describe("attachOverscrollPull", () => {
	function setup() {
		const { model, onTrigger } = makeModel();
		const target = document.createElement("div");
		const onPullBand = vi.fn();
		const onKeyBand = vi.fn();
		let over = 0;
		let clock = 0;
		let keyAt: number | null = null;
		const detach = attachOverscrollPull(model, {
			listenTarget: target,
			overscrollPx: () => over,
			now: () => clock,
			scrollKeyAt: () => keyAt,
			onPullBand,
			onKeyBand,
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
		const scrollKey = ({ after = 0 }: { after?: number } = {}) => {
			clock += after;
			keyAt = clock;
		};
		const settleMidList = () => {
			scroll(-200);
			scrollEnd();
		};
		return {
			model,
			onTrigger,
			onPullBand,
			onKeyBand,
			wheel,
			scroll,
			scrollEnd,
			scrollKey,
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

	it("pulls a band that carries no wheels at all and fires if it ever armed", () => {
		const {
			model,
			onTrigger,
			onPullBand,
			onKeyBand,
			scroll,
			scrollEnd,
			detach,
		} = setup();
		scroll(10, { finger: false });
		expect(model.phase).toBe("pulling");
		expect(onPullBand).toHaveBeenCalledOnce();
		scroll(ARMING_PX, { finger: false });
		scroll(NON_ARMING_PX, { finger: false });
		expect(model.phase).toBe("pulling");
		scrollEnd();
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
		expect(onKeyBand).not.toHaveBeenCalled();
		detach();
	});

	it("pulls from the first band frame when its wheel arrives only after it", () => {
		const { model, onPullBand, onKeyBand, scroll, detach } = setup();
		scroll(3, { finger: false });
		expect(model.phase).toBe("pulling");
		expect(onPullBand).toHaveBeenCalledOnce();
		scroll(10);
		expect(model.phase).toBe("pulling");
		expect(onKeyBand).not.toHaveBeenCalled();
		detach();
	});

	it("keeps reading the band as a pull when it grows on without wheels after Safari's lift-time scrollend", () => {
		const { model, onPullBand, onKeyBand, scroll, scrollEnd, detach } =
			setup();
		scroll(10);
		scroll(NON_ARMING_PX);
		scrollEnd();
		expect(model.phase).toBe("idle");
		scroll(26, { finger: false });
		scroll(31, { finger: false });
		expect(model.phase).toBe("pulling");
		expect(onPullBand).toHaveBeenCalledTimes(4);
		expect(onKeyBand).not.toHaveBeenCalled();
		detach();
	});

	it("reports a band without wheels as a pull even while it is suppressed as momentum", () => {
		const { model, onPullBand, onKeyBand, scroll, detach } = setup();
		scroll(-90, { finger: false });
		scroll(-40, { finger: false });
		scroll(20, { finger: false });
		expect(model.phase).toBe("idle");
		expect(onPullBand).toHaveBeenCalledOnce();
		expect(onKeyBand).not.toHaveBeenCalled();
		detach();
	});

	it("never pulls, arms or fires on a band that a scroll key drives, and reports it", () => {
		const {
			model,
			onTrigger,
			onPullBand,
			onKeyBand,
			scroll,
			scrollEnd,
			scrollKey,
			detach,
		} = setup();
		scrollKey();
		scroll(6, { finger: false });
		expect(model.phase).toBe("idle");
		expect(onKeyBand).toHaveBeenCalledOnce();
		scroll(ARMING_PX, { advance: 100, finger: false });
		expect(model.phase).toBe("idle");
		expect(model.source).toBe(null);
		scroll(0, { finger: false });
		scrollEnd();
		expect(model.phase).toBe("idle");
		expect(onTrigger).not.toHaveBeenCalled();
		expect(onPullBand).not.toHaveBeenCalled();
		detach();
	});

	it("reports a key-driven band only once it is deep enough to be a band", () => {
		const { onKeyBand, scroll, scrollKey, detach } = setup();
		scrollKey();
		scroll(1.5, { finger: false });
		expect(onKeyBand).not.toHaveBeenCalled();
		scroll(3, { advance: 100, finger: false });
		expect(onKeyBand).toHaveBeenCalledOnce();
		detach();
	});

	it("keeps a key-driven band out of the pull for as long as it lasts, after the key press goes stale", () => {
		const { model, onPullBand, onKeyBand, scroll, scrollKey, detach } =
			setup();
		scrollKey();
		scroll(6, { finger: false });
		for (let frame = 1; frame <= 40; frame += 1)
			scroll(6 + frame / 2, { finger: false });
		scroll(4, { finger: false });
		scroll(0, { finger: false });
		expect(model.phase).toBe("idle");
		expect(onPullBand).not.toHaveBeenCalled();
		expect(onKeyBand).toHaveBeenCalled();
		detach();
	});

	it("reads a band again after a pause, by the latest key event", () => {
		const { model, onPullBand, scroll, scrollKey, detach } = setup();
		scrollKey();
		scroll(6, { finger: false });
		scroll(22, { finger: false });
		scrollKey({ after: 400 });
		scroll(12, { finger: false });
		expect(onPullBand).not.toHaveBeenCalled();
		scroll(14, { advance: KEY_BAND_WINDOW_MS + 100, finger: false });
		expect(onPullBand).toHaveBeenCalled();
		expect(model.phase).toBe("pulling");
		detach();
	});

	it("does not count a wheel that moved nothing long before the band as a finger on it", () => {
		const { model, onTrigger, wheel, scroll, scrollEnd, detach } = setup();
		wheel();
		scroll(ARMING_PX, { advance: 1000, finger: false });
		expect(model.phase).toBe("armed");
		scrollEnd();
		expect(model.settledOutcome).toBe("canceled");
		expect(onTrigger).not.toHaveBeenCalled();
		detach();
	});

	it("reads the next band as a pull once the key press is stale", () => {
		const { model, onPullBand, scroll, scrollEnd, scrollKey, detach } =
			setup();
		scrollKey();
		scroll(6, { finger: false });
		scroll(0, { finger: false });
		scrollEnd();
		scroll(10, { advance: KEY_BAND_WINDOW_MS + 100, finger: false });
		expect(model.phase).toBe("pulling");
		expect(onPullBand).toHaveBeenCalledOnce();
		detach();
	});

	it("does not hand a pull that is under way to a key pressed during it", () => {
		const { model, onKeyBand, scroll, scrollKey, detach } = setup();
		scroll(10);
		scrollKey();
		scroll(0.2);
		scroll(12);
		expect(model.phase).toBe("pulling");
		expect(model.displayPx).toBe(12);
		expect(onKeyBand).not.toHaveBeenCalled();
		detach();
	});

	it("reports a band even when the gesture is no pull", () => {
		const { model, onPullBand, onKeyBand, scroll, settleMidList, detach } =
			setup();
		settleMidList();
		scroll(-20, { advance: 100 });
		scroll(30, { advance: 100 });
		expect(model.phase).toBe("idle");
		expect(onPullBand).toHaveBeenCalledOnce();
		expect(onKeyBand).not.toHaveBeenCalled();
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
		const { model, onTrigger, onKeyBand, scroll, scrollEnd, detach } =
			setup();
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
		expect(onKeyBand).not.toHaveBeenCalled();
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

describe("attachOverscrollPull at a conversation's floor", () => {
	const SCROLL_RANGE = 493;

	function attachAtFloor() {
		const { model } = makeModel();
		const scroller = document.createElement("div");
		makeScrollable(scroller, {
			scrollHeight: 1167,
			clientHeight: 674,
			scrollTop: SCROLL_RANGE,
		});
		let clock = 0;
		const detach = attachOverscrollPull(model, {
			listenTarget: scroller,
			overscrollPx: scrollGeometry({
				container: () => scroller,
				position: () => "bottom",
			}).overscrollPx,
			now: () => clock,
		});
		const clampPast = (px: number) => {
			clock += 16;
			scroller.scrollTop = SCROLL_RANGE + px;
			scroller.dispatchEvent(new Event("scroll"));
		};
		return { model, clampPast, detach };
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		{ devicePixelRatio: 1.25, pastRange: 0.6 },
		{ devicePixelRatio: 1.25, pastRange: 1 },
		{ devicePixelRatio: 1.25, pastRange: 1.4 },
		{ devicePixelRatio: 1.25, pastRange: 1.6 },
		{ devicePixelRatio: 2.625, pastRange: 0.6 },
		{ devicePixelRatio: 2.625, pastRange: 1 },
		{ devicePixelRatio: 2.625, pastRange: 1.2 },
	])(
		"reads a layout clamp $pastRange px past the scroll range at a device pixel ratio of $devicePixelRatio as no pull",
		({ devicePixelRatio, pastRange }) => {
			vi.stubGlobal("devicePixelRatio", devicePixelRatio);
			const { model, clampPast, detach } = attachAtFloor();

			clampPast(pastRange);

			expect(model.phase).toBe("idle");
			detach();
		},
	);

	it("still pulls a rubber band that reaches past the rounding", () => {
		vi.stubGlobal("devicePixelRatio", 1.25);
		const { model, clampPast, detach } = attachAtFloor();

		clampPast(2.5);

		expect(model.phase).toBe("pulling");
		detach();
	});
});
