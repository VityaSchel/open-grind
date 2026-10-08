// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
	BUTTON_REST_HEIGHT,
	BUTTON_REST_PX,
	CONTENT_HEIGHT,
	CONTENT_SLIDE_TIMING,
	distinctBands,
	distinctInsets,
	FRAME_MS,
	MIN_REFRESHING_MS,
	mountAtRest,
	settle,
	SHORT_CONTENT_HEIGHT,
	slideRecorder,
	TWEEN_FRAMES,
	TWEEN_MS,
	useRefreshControlHarness,
} from "./refresh-control-test-harness";

const reducedMotion = vi.hoisted(() => ({ current: false }));

vi.mock("svelte/motion", async (importOriginal) => ({
	...(await importOriginal<typeof import("svelte/motion")>()),
	prefersReducedMotion: reducedMotion,
}));

describe("the refresh control's room for its button", () => {
	useRefreshControlHarness({ reducedMotion });

	it("moves the list down to the resting button's row at once, and slides it there in step with the button's own box", async () => {
		const view = await mountAtRest("top");
		const insetChangesAtRest = view.insetChanges();
		expect(view.contentInset()).toBe("0px");

		await view.wheelWithoutBand();
		const revealedAt = performance.now();
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
		expect(view.contentTop()).toBe(0);
		const opening = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctInsets(opening)).toEqual([BUTTON_REST_HEIGHT]);
		expect(distinctBands(opening).length).toBeGreaterThan(2);
		for (const { band, contentTop } of opening)
			expect(contentTop).toBeCloseTo(parseFloat(band));
		expect(view.insetChanges()).toBe(insetChangesAtRest + 1);
		expect(view.slides()).toMatchObject([
			{
				fromPx: -BUTTON_REST_PX,
				toPx: 0,
				timing: CONTENT_SLIDE_TIMING,
				pinnedAt: revealedAt,
				cancelled: false,
			},
		]);
		expect(view.contentTop()).toBe(BUTTON_REST_PX);
		expect(view.button()).not.toBeNull();
	});

	it("keeps the list in step with the button's box while the browser's frame clock lags behind", async () => {
		const view = await mountAtRest("top");
		slideRecorder.stallFrameClock();

		await view.wheelWithoutBand();
		const opening = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctBands(opening).length).toBeGreaterThan(2);
		for (const { band, contentTop } of opening)
			expect(contentTop).toBeCloseTo(parseFloat(band));
		expect(view.contentTop()).toBe(BUTTON_REST_PX);
	});

	it("slides the list back up in step with the button's box when the reader scrolls away, and gives the room back once the list is there", async () => {
		const view = await mountAtRest("top");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);
		const insetChangesWhileShown = view.insetChanges();

		await view.scrollIntoContent(10);
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
		expect(view.contentTop()).toBe(BUTTON_REST_PX - 10);
		const closing = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctBands(closing).length).toBeGreaterThan(2);
		for (const { band, contentTop } of closing)
			expect(contentTop + 10).toBeCloseTo(parseFloat(band));
		expect(distinctInsets(closing)).toEqual([BUTTON_REST_HEIGHT, "0px"]);
		expect(view.insetChanges()).toBe(insetChangesWhileShown + 1);
		expect(view.slides().at(-1)).toMatchObject({
			fromPx: 0,
			toPx: -BUTTON_REST_PX,
			timing: CONTENT_SLIDE_TIMING,
		});
		expect(view.contentTop()).toBe(-10);
	});

	it("turns the list around from wherever its slide has got to when the button goes away mid-reveal", async () => {
		const view = await mountAtRest("top");
		await view.wheelWithoutBand();
		await view.wait(FRAME_MS * 5);
		const midReveal = view.contentTop();
		expect(midReveal).toBeGreaterThan(0);
		expect(midReveal).toBeLessThan(BUTTON_REST_PX);

		await view.scrollIntoContent(10);

		const [opening, closing] = view.slides();
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
		expect(opening?.cancelled).toBe(true);
		expect(closing?.fromPx).toBeCloseTo(midReveal - BUTTON_REST_PX);
		expect(closing?.toPx).toBe(-BUTTON_REST_PX);
		expect(view.contentTop()).toBeCloseTo(midReveal - 10);

		await view.wait(TWEEN_MS);
		expect(view.contentInset()).toBe("0px");
		expect(view.contentTop()).toBe(-10);
	});

	it("moves the list without a slide when the reader prefers reduced motion", async () => {
		reducedMotion.current = true;
		const view = await mountAtRest("top");

		await view.wheelWithoutBand();
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
		expect(view.contentTop()).toBe(BUTTON_REST_PX);
		await view.scrollIntoContent(10);

		expect(view.contentInset()).toBe("0px");
		expect(view.contentTop()).toBe(-10);
		expect(view.slides()).toEqual([]);
	});

	it("leaves the list where it is for a refresh that started elsewhere", async () => {
		const view = await mountAtRest("top");

		await view.setUpdating(true);
		const whileRefreshing = await view.contentFramesOver(TWEEN_FRAMES);

		expect(view.disc()).not.toBeNull();
		expect(distinctInsets(whileRefreshing)).toEqual(["0px"]);
	});

	it("leaves the list to the rubber band during a pull and after the pull fires", async () => {
		const view = await mountAtRest("top");
		const whilePulling: string[] = [];

		for (const px of [6, 14, 22]) {
			await view.moveBandTo({ px: px, pulledByWheel: true });
			whilePulling.push(view.contentInset());
		}
		expect(view.band().style.height).toBe("22px");
		await view.releaseBand();
		const afterRelease = await view.contentFramesOver(TWEEN_FRAMES);

		expect(view.disc()).not.toBeNull();
		expect(whilePulling).toEqual(["0px", "0px", "0px"]);
		expect(distinctInsets(afterRelease)).toEqual(["0px"]);
		expect(view.slides()).toEqual([]);
	});

	it("holds the list down while a clicked refresh spins in the button's place", async () => {
		const view = await mountAtRest("top");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);

		view.button()!.click();
		await view.setUpdating(true);
		const whileRefreshing = await view.contentFramesOver(TWEEN_FRAMES);
		expect(view.disc()).not.toBeNull();
		await view.wait(MIN_REFRESHING_MS);
		await view.setUpdating(false);
		const afterwards = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctInsets(whileRefreshing)).toEqual([BUTTON_REST_HEIGHT]);
		expect(distinctInsets(afterwards)).toEqual([BUTTON_REST_HEIGHT]);
	});

	it("takes its inset and its slide off the list when it unmounts", async () => {
		const view = await mountAtRest("top");
		await view.wheelWithoutBand();
		await view.wait(FRAME_MS);
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);

		view.unmount();
		await settle();

		expect(view.contentInset()).toBe("");
		expect(view.slides()).toMatchObject([{ cancelled: true }]);
	});

	it("makes the same room above the composer at once without lifting a conversation off its floor, and slides the conversation up into it", async () => {
		const view = await mountAtRest("bottom");
		const restingBottom = view.contentBottom();
		const insetChangesAtRest = view.insetChanges();
		const scrollWritesAtRest = view.scrollWrites();
		expect(view.contentInset()).toBe("0px");

		await view.wheelWithoutBand();
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
		expect(view.contentBottom()).toBe(restingBottom);
		const opening = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctInsets(opening)).toEqual([BUTTON_REST_HEIGHT]);
		for (const { restDistance } of opening)
			expect(restDistance).toBeLessThan(1);
		for (const { band, contentTop } of opening)
			expect(restingBottom - (contentTop + CONTENT_HEIGHT)).toBeCloseTo(
				parseFloat(band),
			);
		expect(view.scrollWrites()).toBe(scrollWritesAtRest + 1);
		expect(view.insetChanges()).toBe(insetChangesAtRest + 1);
		expect(view.slides()).toMatchObject([
			{ fromPx: BUTTON_REST_PX, toPx: 0, cancelled: false },
		]);
		expect(view.contentBottom()).toBe(restingBottom - BUTTON_REST_PX);
		expect(view.button()).not.toBeNull();
	});

	it("keeps a conversation on its true floor while that room opens, where the floor rounds a whole pixel below the scroll range", async () => {
		vi.stubGlobal("devicePixelRatio", 1.25);
		const view = await mountAtRest("bottom", { floorRoundingPx: 1 });

		await view.wheelWithoutBand();
		const opening = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctInsets(opening)).toEqual([BUTTON_REST_HEIGHT]);
		for (const { restDistance } of opening) expect(restDistance).toBe(0);
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
		expect(view.button()).not.toBeNull();
	});

	it("hides the button above the composer on a wheel away from it in a conversation too short to scroll", async () => {
		const view = await mountAtRest("bottom", {
			contentHeight: SHORT_CONTENT_HEIGHT,
		});
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);
		expect(view.button()).not.toBeNull();

		await view.wheelAwayWithoutScrolling();
		await view.wait(TWEEN_MS);

		expect(view.button()).toBeNull();
	});

	it("offers the button again once a long conversation scrolls back to its floor after a wheel away", async () => {
		const view = await mountAtRest("bottom");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);

		await view.wheelAwayWithoutScrolling();
		await view.scrollIntoContent(10);
		await view.wait(TWEEN_MS);
		expect(view.button()).toBeNull();
		await view.scrollIntoContent(-10);
		await view.wait(TWEEN_MS);

		expect(view.button()).not.toBeNull();
	});

	it("keeps that room while the reader is scrolled up, so none of their scroll is taken back", async () => {
		const view = await mountAtRest("bottom");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);

		await view.scrollIntoContent(10);
		const scrolledUp = await view.contentFramesOver(TWEEN_FRAMES);

		expect(view.button()).toBeNull();
		expect(distinctInsets(scrolledUp)).toEqual([BUTTON_REST_HEIGHT]);
		for (const { restDistance } of scrolledUp)
			expect(restDistance).toBe(10);
		expect(view.slides()).toHaveLength(1);
	});

	it("gives the room above the composer back once a rubber band shows up, without scrolling under the band", async () => {
		const view = await mountAtRest("bottom");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);
		const scrollWritesBeforeBand = view.scrollWrites();
		expect(scrollWritesBeforeBand).toBeGreaterThan(0);

		await view.moveBandTo({ px: 6, pulledByWheel: true });
		expect(view.contentInset()).toBe("0px");
		const closing = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctInsets(closing)).toEqual(["0px"]);
		expect(view.scrollWrites()).toBe(scrollWritesBeforeBand);
	});
});
