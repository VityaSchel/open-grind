// @vitest-environment jsdom

import { expoOut } from "svelte/easing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contentSlide } from "./content-slide";
import { contentSlideRecorder } from "./content-slide-test-helpers";

vi.mock("svelte/motion", async (importOriginal) => ({
	...(await importOriginal<typeof import("svelte/motion")>()),
	prefersReducedMotion: { current: false },
}));

const FRAME_MS = 16;
const ROOM_PX = 56;
const TIMING = { duration: 250, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };

let recorder = contentSlideRecorder();

function mountList() {
	const scroller = document.createElement("div");
	const content = document.createElement("div");
	content.dataset.refreshContent = "";
	let layoutTop = ROOM_PX;
	const top = () => layoutTop + recorder.offsetPx();
	Object.defineProperty(content, "getBoundingClientRect", {
		value: () => ({ top: top(), bottom: top() }) as DOMRect,
	});
	scroller.append(content);
	document.body.append(scroller);

	const slide = contentSlide({ timing: TIMING });
	const giveRoomBack = vi.fn(() => (layoutTop = 0));
	const keepRoom = vi.fn();
	const frames = (count: number) => {
		for (let frame = 0; frame < count; frame += 1) {
			vi.advanceTimersByTime(FRAME_MS);
			slide.follow();
		}
	};

	return { scroller, slide, top, giveRoomBack, keepRoom, frames };
}

describe("contentSlide", () => {
	beforeEach(() => {
		vi.useFakeTimers({
			toFake: [
				"requestAnimationFrame",
				"cancelAnimationFrame",
				"performance",
			],
		});
		recorder = contentSlideRecorder();
		recorder.installTimeline();
		vi.spyOn(Element.prototype, "animate").mockImplementation(
			(keyframes, timing) =>
				recorder.record({
					keyframes: keyframes as [Keyframe, Keyframe],
					timing: timing as KeyframeAnimationOptions,
				}),
		);
	});

	afterEach(() => {
		document.body.replaceChildren();
		recorder.removeTimeline();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("slides the list up by the room first and gives the room back once the list is there", () => {
		const list = mountList();

		list.slide.ahead({
			scroller: list.scroller,
			byPx: -ROOM_PX,
			change: list.giveRoomBack,
		});
		list.frames(5);
		const midway = list.top();

		expect(midway).toBeGreaterThan(0);
		expect(midway).toBeLessThan(ROOM_PX);
		expect(list.giveRoomBack).not.toHaveBeenCalled();
		list.frames(15);
		expect(list.giveRoomBack).toHaveBeenCalledOnce();
		expect(list.top()).toBe(0);
		expect(recorder.slides()).toMatchObject([
			{ fromPx: 0, toPx: -ROOM_PX, cancelled: true },
		]);
	});

	it("keeps the room it was about to give back when the list turns back before it lands", () => {
		const list = mountList();
		list.slide.ahead({
			scroller: list.scroller,
			byPx: -ROOM_PX,
			change: list.giveRoomBack,
		});
		list.frames(5);
		const midway = list.top();

		list.slide.across({
			scroller: list.scroller,
			edge: "top",
			change: list.keepRoom,
		});
		expect(list.top()).toBeCloseTo(midway);
		list.frames(20);

		expect(list.keepRoom).toHaveBeenCalledOnce();
		expect(list.giveRoomBack).not.toHaveBeenCalled();
		expect(recorder.slides().at(-1)?.fromPx).toBeCloseTo(midway - ROOM_PX);
		expect(list.top()).toBe(ROOM_PX);
	});

	it("keeps the room it was about to give back when it is cancelled before the list lands", () => {
		const list = mountList();
		list.slide.ahead({
			scroller: list.scroller,
			byPx: -ROOM_PX,
			change: list.giveRoomBack,
		});
		list.frames(5);

		list.slide.cancel();
		list.frames(20);

		expect(list.giveRoomBack).not.toHaveBeenCalled();
		expect(list.top()).toBe(ROOM_PX);
	});

	it("turns the list around from where it stands on the follow() clock while the browser's frame clock lags behind", () => {
		const list = mountList();
		recorder.stallFrameClock();
		const slideStartedAt = performance.now();
		list.slide.ahead({
			scroller: list.scroller,
			byPx: -ROOM_PX,
			change: list.giveRoomBack,
		});
		list.frames(5);
		vi.advanceTimersByTime(FRAME_MS / 2);
		const progress = (performance.now() - slideStartedAt) / TIMING.duration;

		list.slide.across({
			scroller: list.scroller,
			edge: "top",
			change: list.keepRoom,
		});

		expect(recorder.slides().at(-1)?.fromPx).toBeCloseTo(
			-ROOM_PX * expoOut(progress),
		);
	});
});
