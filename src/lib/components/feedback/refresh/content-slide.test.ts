// @vitest-environment jsdom

import { expoOut } from "svelte/easing";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";

import { contentSlide, PacingTween, type SlidePacer } from "./content-slide";
import { contentSlideRecorder } from "./content-slide-test-helpers";

vi.mock("svelte/motion", async (importOriginal) => ({
	...(await importOriginal<typeof import("svelte/motion")>()),
	prefersReducedMotion: { current: false },
}));

const FRAME_MS = 16;
const SHARED_FRAME_LOOP_DRAIN_MS = 300;
const ROOM_PX = 56;
const TIMING = { duration: 250, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };

let recorder = contentSlideRecorder();
let animate: MockInstance<Element["animate"]>;

function mountList({ pacedBy }: { pacedBy?: SlidePacer } = {}) {
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

	const slide = contentSlide({ ...TIMING, pacedBy });
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
		animate = vi
			.spyOn(Element.prototype, "animate")
			.mockImplementation((keyframes, timing) =>
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

	it("eases on the first keyframe, since WebKitGTK plays an effect-level easing as linear", () => {
		const list = mountList();

		list.slide.across({
			scroller: list.scroller,
			edge: "top",
			change: list.giveRoomBack,
		});

		const [keyframes, timing] = animate.mock.calls[0]!;
		expect((keyframes as Keyframe[])[0]?.easing).toBe(TIMING.easing);
		expect(timing).not.toHaveProperty("easing");
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

	it("keeps the list in step with a button that started moving a stall before the slide", () => {
		const buttonStartedAt = performance.now();
		vi.advanceTimersByTime(FRAME_MS / 4);
		const list = mountList({
			pacedBy: { clockOrigin: () => buttonStartedAt },
		});
		list.slide.across({
			scroller: list.scroller,
			edge: "top",
			change: list.giveRoomBack,
		});
		list.frames(2);
		const buttonProgress =
			(performance.now() - buttonStartedAt) / TIMING.duration;

		expect(list.top()).toBeCloseTo(ROOM_PX * (1 - expoOut(buttonProgress)));
	});
});

describe("PacingTween", () => {
	beforeEach(() => {
		vi.useFakeTimers({
			toFake: [
				"requestAnimationFrame",
				"cancelAnimationFrame",
				"performance",
			],
		});
	});

	afterEach(() => {
		vi.advanceTimersByTime(SHARED_FRAME_LOOP_DRAIN_MS);
		vi.useRealTimers();
	});

	it("dates a slide that starts in the button's flush from the button's start, however long the page stalls in between", () => {
		const button = new PacingTween(0, { duration: TIMING.duration });
		vi.advanceTimersByTime(FRAME_MS);
		const startedAt = performance.now();

		void button.set(ROOM_PX);
		vi.advanceTimersByTime(FRAME_MS / 4);

		expect(button.clockOrigin()).toBe(startedAt);
	});

	it("dates a slide that a later change starts from now, even while the button is still moving", async () => {
		const button = new PacingTween(0, { duration: TIMING.duration });
		void button.set(ROOM_PX);
		await Promise.resolve();

		vi.advanceTimersByTime(FRAME_MS * 3);

		expect(button.current).toBeGreaterThan(0);
		expect(button.current).toBeLessThan(ROOM_PX);
		expect(button.clockOrigin()).toBe(performance.now());
	});
});
