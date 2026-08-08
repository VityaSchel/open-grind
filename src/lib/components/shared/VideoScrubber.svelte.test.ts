// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import VideoScrubber from "./VideoScrubber.svelte";

const DURATION = 100;
const TRACK_WIDTH = 200;
const THUMB_WIDTH = 24;
const INSET = THUMB_WIDTH / 2;

const BUFFERED = '[data-slot="scrubber-buffered"]';
const PLAYED = '[data-slot="scrubber-played"]';
const THUMB = '[data-slot="scrubber-thumb"]';

const playhead = (ratio: number) =>
	`calc(${ratio} * (100% - var(--thumb-width)) + var(--thumb-width) / 2)`;

function scrubber(
	props: {
		currentTime?: number;
		duration?: number;
		buffered?: { start: number; end: number }[];
	} = {},
) {
	const onseek = vi.fn();
	const { container } = render(VideoScrubber, {
		props: {
			currentTime: 0,
			duration: DURATION,
			buffered: [],
			onseek,
			...props,
		},
	});
	const track = container.querySelector<HTMLElement>('[role="slider"]')!;
	track.getBoundingClientRect = () =>
		({ left: 0, width: TRACK_WIDTH }) as DOMRect;
	track.setPointerCapture = vi.fn();
	track.releasePointerCapture = vi.fn();
	const thumb = container.querySelector<HTMLElement>(THUMB)!;
	/** jsdom lays nothing out. */
	Object.defineProperty(thumb, "offsetWidth", { value: THUMB_WIDTH });
	return { container, track, thumb, onseek };
}

/** jsdom ships no `PointerEvent`, and a bare `Event` carries no coordinate. */
function pointer(track: HTMLElement, type: string, clientX: number) {
	return fireEvent(
		track,
		new MouseEvent(type, { clientX, bubbles: true, cancelable: true }),
	);
}

describe("VideoScrubber", () => {
	afterEach(cleanup);

	it("seeks to the fraction of the track that was pressed", async () => {
		const { track, onseek } = scrubber();

		await pointer(track, "pointerdown", TRACK_WIDTH / 2);

		expect(onseek).toHaveBeenCalledWith(DURATION / 2);
	});

	it("seeks by the travel the thumb has, not the width the track has", async () => {
		const { track, onseek } = scrubber();

		await pointer(track, "pointerdown", INSET);
		expect(onseek).toHaveBeenLastCalledWith(0);

		await pointer(track, "pointermove", TRACK_WIDTH - INSET);
		expect(onseek).toHaveBeenLastCalledWith(DURATION);

		await pointer(
			track,
			"pointermove",
			INSET + (TRACK_WIDTH - 2 * INSET) / 4,
		);
		expect(onseek).toHaveBeenLastCalledWith(DURATION / 4);
	});

	it("follows the pointer only once it has been grabbed", async () => {
		const { track, onseek } = scrubber();

		await pointer(track, "pointermove", 40);
		expect(onseek).not.toHaveBeenCalled();

		await pointer(track, "pointerdown", 100);
		await pointer(track, "pointermove", 56);
		expect(onseek).toHaveBeenLastCalledWith(25);

		await pointer(track, "pointerup", 56);
		await pointer(track, "pointermove", 180);
		expect(onseek).toHaveBeenLastCalledWith(25);
	});

	it("clamps a drag that leaves the track to the clip", async () => {
		const { track, onseek } = scrubber();

		await pointer(track, "pointerdown", 100);
		await pointer(track, "pointermove", -500);
		expect(onseek).toHaveBeenLastCalledWith(0);

		await pointer(track, "pointermove", 5000);
		expect(onseek).toHaveBeenLastCalledWith(DURATION);

		await pointer(track, "pointermove", 0);
		expect(onseek).toHaveBeenLastCalledWith(0);

		await pointer(track, "pointermove", TRACK_WIDTH);
		expect(onseek).toHaveBeenLastCalledWith(DURATION);
	});

	it("stays inert until a duration is known", async () => {
		const { track, onseek } = scrubber({ duration: 0 });

		await pointer(track, "pointerdown", 100);

		expect(onseek).not.toHaveBeenCalled();
	});

	it("steps with the arrow keys and jumps with home and end", async () => {
		const { track, onseek } = scrubber({ currentTime: 50 });

		await fireEvent.keyDown(track, { key: "ArrowRight" });
		expect(onseek).toHaveBeenLastCalledWith(55);

		await fireEvent.keyDown(track, { key: "ArrowLeft" });
		expect(onseek).toHaveBeenLastCalledWith(45);

		await fireEvent.keyDown(track, { key: "Home" });
		expect(onseek).toHaveBeenLastCalledWith(0);

		await fireEvent.keyDown(track, { key: "End" });
		expect(onseek).toHaveBeenLastCalledWith(DURATION);
	});

	it("clamps a step at either end of the clip", async () => {
		const { track, onseek } = scrubber({ currentTime: 2 });
		await fireEvent.keyDown(track, { key: "ArrowLeft" });
		expect(onseek).toHaveBeenLastCalledWith(0);

		cleanup();
		const late = scrubber({ currentTime: DURATION - 2 });
		await fireEvent.keyDown(late.track, { key: "ArrowRight" });
		expect(late.onseek).toHaveBeenLastCalledWith(DURATION);
	});

	it("consumes only the keys it acts on, so the lightbox keeps the rest", async () => {
		const { track, onseek } = scrubber({ currentTime: 50 });

		expect(await fireEvent.keyDown(track, { key: "ArrowRight" })).toBe(
			false,
		);
		expect(await fireEvent.keyDown(track, { key: "Escape" })).toBe(true);
		expect(onseek).toHaveBeenCalledTimes(1);
	});

	it("reports the buffered run that covers the playhead", () => {
		const { container } = scrubber({
			currentTime: 10,
			buffered: [
				{ start: 0, end: 40 },
				{ start: 60, end: 100 },
			],
		});

		expect(
			container.querySelector<HTMLElement>(BUFFERED)?.style.width,
		).toBe("40%");
		expect(container.querySelector<HTMLElement>(PLAYED)?.style.width).toBe(
			playhead(0.1),
		);
	});

	it("shows no buffered run when the playhead sits in a gap", () => {
		const { container } = scrubber({
			currentTime: 50,
			buffered: [{ start: 0, end: 40 }],
		});

		expect(
			container.querySelector<HTMLElement>(BUFFERED)?.style.width,
		).toBe("0%");
	});

	it("keeps the thumb inside the track at either end", () => {
		const start = scrubber();
		expect(start.thumb.style.left).toBe(playhead(0));

		cleanup();
		const end = scrubber({ currentTime: DURATION });
		expect(end.thumb.style.left).toBe(playhead(1));
	});

	it("keeps the thumb inside the track when the clip overruns its duration", () => {
		const { thumb } = scrubber({ currentTime: DURATION + 10 });

		expect(thumb.style.left).toBe(playhead(1));
		expect(thumb.style.transformOrigin).toBe("100% center");
	});

	it("pivots the thumb's scale at its own position, so growing stays inside", () => {
		const start = scrubber();
		expect(start.thumb.style.transformOrigin).toBe("0% center");

		cleanup();
		const middle = scrubber({ currentTime: DURATION / 2 });
		expect(middle.thumb.style.transformOrigin).toBe("50% center");

		cleanup();
		const end = scrubber({ currentTime: DURATION });
		expect(end.thumb.style.transformOrigin).toBe("100% center");
	});

	it("ends the played fill on the thumb", () => {
		const { container, thumb } = scrubber({ currentTime: 30 });

		expect(container.querySelector<HTMLElement>(PLAYED)?.style.width).toBe(
			thumb.style.left,
		);
	});
});
