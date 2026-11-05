// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { attachNativeBandPull } from "./native-band-adapter";
import { makeModel, makeScrollable, touchEvent } from "./pull-test-helpers";
import type { PullPosition } from "./scroll-chain";

const ARM_PX = 58;
const FRAME_MS = 16;

function harness({
	position = "top",
	markCarousel = false,
}: { position?: PullPosition; markCarousel?: boolean } = {}) {
	const scroller = document.createElement("div");
	const row = document.createElement("a");
	const carousel = document.createElement("div");
	const photo = document.createElement("img");
	const outside = document.createElement("header");
	carousel.append(photo);
	scroller.append(row, carousel);
	document.body.append(outside, scroller);
	makeScrollable(carousel, { scrollTop: 0 });
	if (markCarousel) carousel.setAttribute("data-refresh-no-pull", "");

	const { model, onTrigger } = makeModel();
	model.space = ARM_PX;
	const onPullBand = vi.fn();
	let band = 0;
	const detach = attachNativeBandPull(model, {
		scroller,
		position,
		overscrollPx: () => band,
		honorNoPull: true,
		onPullBand,
	});

	return {
		model,
		onTrigger,
		onPullBand,
		row,
		carousel,
		photo,
		outside,
		detach() {
			detach();
			scroller.remove();
			outside.remove();
		},
		touch(on: Element = row, id = 0) {
			on.dispatchEvent(touchEvent("touchstart", { id }));
		},
		secondFinger(on: Element = row) {
			const event = touchEvent("touchstart", { id: 1 });
			Object.defineProperty(event, "touches", {
				value: [{ identifier: 0 }, { identifier: 1 }],
			});
			on.dispatchEvent(event);
		},
		liftOneOfTwo({ lifted = 1 }: { lifted?: 0 | 1 } = {}) {
			const event = touchEvent("touchend", { id: lifted });
			Object.defineProperty(event, "touches", {
				value: [{ identifier: 1 - lifted }],
			});
			row.dispatchEvent(event);
		},
		lift() {
			row.dispatchEvent(touchEvent("touchend"));
		},
		cancelTouch(id = 0) {
			row.dispatchEvent(touchEvent("touchcancel", { id }));
		},
		bandTo(px: number) {
			band = px;
			scroller.dispatchEvent(new Event("scroll"));
		},
		holdAt(px: number) {
			band = px;
			vi.advanceTimersByTime(FRAME_MS);
		},
		bandWithoutFrame(px: number) {
			band = px;
		},
	};
}

beforeEach(() => {
	runningOn("ios");
	vi.useFakeTimers({
		toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
	});
});

afterEach(() => {
	vi.useRealTimers();
	resetPlatform();
});

describe("the native rubber band under a finger", () => {
	it("follows the band past the top, arms at the line and refreshes on lift", () => {
		const h = harness();

		h.touch();
		h.bandTo(30);
		expect(h.model.source).toBe("band");
		expect(h.model.phase).toBe("pulling");
		expect(h.model.displayPx).toBe(30);
		expect(h.onPullBand).toHaveBeenCalledOnce();

		h.bandTo(ARM_PX + 4);
		expect(h.model.phase).toBe("armed");

		h.lift();
		expect(h.onTrigger).toHaveBeenCalledOnce();
		expect(h.model.phase).toBe("refreshing");
		h.detach();
	});

	it("cancels when the finger eases the band back under the line before lifting", () => {
		const h = harness();

		h.touch();
		h.bandTo(ARM_PX + 10);
		h.bandTo(ARM_PX - 20);
		h.lift();

		expect(h.onTrigger).not.toHaveBeenCalled();
		expect(h.model.phase).toBe("idle");
		expect(h.model.settledOutcome).toBe("canceled");
		h.detach();
	});

	it("reads the band every frame while the finger holds still", () => {
		const h = harness();

		h.touch();
		h.bandTo(10);
		h.holdAt(ARM_PX + 2);

		expect(h.model.phase).toBe("armed");
		h.detach();
	});

	it("reads the last band at lift even when no frame ran since", () => {
		const h = harness();

		h.touch();
		h.bandTo(10);
		h.bandWithoutFrame(ARM_PX + 2);
		h.lift();

		expect(h.onTrigger).toHaveBeenCalledOnce();
		h.detach();
	});

	it("leaves a fling's bounce alone while no finger is down", () => {
		const h = harness();

		h.bandTo(ARM_PX * 2);
		h.bandTo(0);

		expect(h.model.phase).toBe("idle");
		expect(h.onPullBand).not.toHaveBeenCalled();
		h.detach();
	});

	it("waits for a bounce caught by the finger to return before counting a new band", () => {
		const h = harness();

		h.bandTo(40);
		h.touch();
		h.bandTo(ARM_PX + 10);
		expect(h.model.phase).toBe("idle");

		h.bandTo(0);
		h.bandTo(ARM_PX + 10);
		expect(h.model.phase).toBe("armed");
		h.detach();
	});

	it("refreshes a drag that starts mid-list and keeps pulling past the top", () => {
		const h = harness();

		h.bandTo(-300);
		h.touch();
		h.bandTo(-120);
		expect(h.model.phase).toBe("idle");
		h.bandTo(ARM_PX + 1);
		h.lift();

		expect(h.onTrigger).toHaveBeenCalledOnce();
		h.detach();
	});

	it("cancels when the finger pushes back into the list and starts over past the edge again", () => {
		const h = harness();

		h.touch();
		h.bandTo(20);
		h.bandTo(-40);
		expect(h.model.phase).toBe("idle");
		expect(h.model.settledOutcome).toBe("canceled");

		h.bandTo(ARM_PX + 1);
		expect(h.model.phase).toBe("armed");
		h.detach();
	});

	it("pulls the floor of a bottom-anchored list the same way", () => {
		const h = harness({ position: "bottom" });

		h.touch();
		h.bandTo(ARM_PX + 3);
		h.lift();

		expect(h.onTrigger).toHaveBeenCalledOnce();
		h.detach();
	});

	it("keeps pulling through a second finger and releases on the last lift", () => {
		const h = harness();

		h.touch();
		h.bandTo(ARM_PX + 3);
		h.secondFinger();
		h.liftOneOfTwo();
		expect(h.model.phase).toBe("armed");

		h.lift();
		expect(h.onTrigger).toHaveBeenCalledOnce();
		h.detach();
	});

	it("refreshes when the pulling finger lifts while another finger rests outside the list", () => {
		const h = harness();

		h.touch();
		h.bandTo(ARM_PX + 3);
		h.secondFinger(h.outside);
		h.liftOneOfTwo({ lifted: 0 });

		expect(h.onTrigger).toHaveBeenCalledOnce();
		expect(h.model.phase).toBe("refreshing");
		h.detach();
	});

	it("keeps pulling when a finger outside the list lifts or is cancelled", () => {
		const h = harness();

		h.touch();
		h.bandTo(ARM_PX + 3);
		h.secondFinger(h.outside);
		h.cancelTouch(1);
		h.secondFinger(h.outside);
		h.liftOneOfTwo();
		expect(h.model.phase).toBe("armed");

		h.lift();
		expect(h.onTrigger).toHaveBeenCalledOnce();
		h.detach();
	});

	it("cancels a pull whose touch is cancelled", () => {
		const h = harness();

		h.touch();
		h.bandTo(ARM_PX + 3);
		h.cancelTouch();

		expect(h.onTrigger).not.toHaveBeenCalled();
		expect(h.model.phase).toBe("idle");
		h.detach();
	});

	it("ignores a band under a finger that landed outside the list", () => {
		const h = harness();

		h.touch(h.outside);
		h.bandTo(ARM_PX + 3);
		h.lift();

		expect(h.model.phase).toBe("idle");
		expect(h.onTrigger).not.toHaveBeenCalled();
		h.detach();
	});

	it("pulls from a nested scroller resting at its own top", () => {
		const h = harness();

		h.touch(h.photo);
		h.bandTo(ARM_PX + 3);
		h.lift();

		expect(h.onTrigger).toHaveBeenCalledOnce();
		h.detach();
	});

	it("never pulls from a no-pull area at its own top, while the rest of the list still pulls", () => {
		const h = harness({ markCarousel: true });

		h.touch(h.photo);
		h.bandTo(ARM_PX + 3);
		h.lift();
		expect(h.model.phase).toBe("idle");
		expect(h.onPullBand).not.toHaveBeenCalled();
		expect(h.onTrigger).not.toHaveBeenCalled();

		h.bandTo(0);
		h.touch();
		h.bandTo(ARM_PX + 3);
		h.lift();
		expect(h.onTrigger).toHaveBeenCalledOnce();
		h.detach();
	});

	it("pulls once a drag from a no-pull area has scrolled the list back to its edge", () => {
		const h = harness({ markCarousel: true });
		h.bandTo(-150);

		h.touch(h.photo);
		h.bandTo(-40);
		h.bandTo(0);
		h.bandTo(ARM_PX + 3);
		h.lift();
		expect(h.onTrigger).toHaveBeenCalledOnce();
		h.detach();
	});

	it("leaves the band to a nested scroller that could still scroll toward the edge", () => {
		const h = harness();
		h.carousel.scrollTop = 120;

		h.touch(h.photo);
		h.bandTo(ARM_PX + 3);
		h.lift();

		expect(h.model.phase).toBe("idle");
		expect(h.onTrigger).not.toHaveBeenCalled();
		h.detach();
	});

	it("does not start over a refresh that is still running", () => {
		const h = harness();
		h.touch();
		h.bandTo(ARM_PX + 3);
		h.lift();
		h.bandTo(0);

		h.touch();
		h.bandTo(ARM_PX + 3);
		h.lift();

		expect(h.onTrigger).toHaveBeenCalledOnce();
		expect(h.model.phase).toBe("refreshing");
		h.detach();
	});

	it("cancels an unfinished pull when detached", () => {
		const h = harness();

		h.touch();
		h.bandTo(ARM_PX + 3);
		h.detach();

		expect(h.model.phase).toBe("idle");
		expect(h.onTrigger).not.toHaveBeenCalled();
	});
});
