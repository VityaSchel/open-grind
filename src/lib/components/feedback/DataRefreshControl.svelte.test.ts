// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataRefreshControl from "./DataRefreshControl.svelte";

const FRAME_MS = 16;
const TWEEN_FRAMES = 20;
const TWEEN_MS = TWEEN_FRAMES * FRAME_MS;
const SHARED_FRAME_LOOP_DRAIN_MS = 300;
const PAST_MOUSE_PROBE_MS = 150;
const MIN_REFRESHING_MS = 500;
const BUTTON_REST_HEIGHT = "56px";
const CONTENT_HEIGHT = 2000;
const VIEWPORT_HEIGHT = 500;

type Edge = "top" | "bottom";
type ContentFrame = { band: string; inset: string; restDistance: number };

const distinctInsets = (frames: ContentFrame[]) => [
	...new Set(frames.map(({ inset }) => inset)),
];

const distinctBands = (frames: ContentFrame[]) => [
	...new Set(frames.map(({ band }) => band)),
];

type HeldAnimation = { onfinish: (() => void) | null };

let heldAnimations: HeldAnimation[] = [];
let outroEvents: string[] = [];
let outroListeners = new AbortController();

async function settle() {
	for (let turn = 0; turn < 6; turn += 1) await tick();
}

async function mountAtRest(edge: Edge) {
	const scroller = document.createElement("div");
	const intoContent = edge === "top" ? 1 : -1;
	const contentInset = () =>
		scroller.style.getPropertyValue(`--refresh-inset-${edge}`);
	const maxScrollTop = () =>
		CONTENT_HEIGHT + (parseFloat(contentInset()) || 0) - VIEWPORT_HEIGHT;
	const restDistance = () =>
		edge === "top" ? scrollTop : maxScrollTop() - scrollTop;
	let bandPx = 0;
	let scrollWrites = 0;
	let scrollTop = edge === "top" ? 0 : maxScrollTop();
	Object.defineProperties(scroller, {
		scrollHeight: {
			get: () => maxScrollTop() + VIEWPORT_HEIGHT,
			configurable: true,
		},
		clientHeight: { value: VIEWPORT_HEIGHT, configurable: true },
		scrollTop: {
			get: () => scrollTop - intoContent * bandPx,
			set: () => {},
			configurable: true,
		},
		scroll: {
			value: ({ top }: { top: number }) => {
				scrollTop = top;
				scrollWrites += 1;
			},
			configurable: true,
		},
	});
	document.body.append(scroller);

	const view = render(DataRefreshControl, {
		props: { container: scroller, position: edge, updating: false },
	});
	await settle();

	const anchor = () =>
		view.container.querySelector<HTMLElement>("[data-refresh-phase]")!;
	const band = () =>
		view.container.querySelector<HTMLElement>(
			'[data-slot="refresh-band"]',
		)!;
	const discWindow = () =>
		view.container.querySelector<HTMLElement>(
			'[data-slot="refresh-disc-window"]',
		)!;
	const wait = async (ms: number) => {
		vi.advanceTimersByTime(ms);
		await settle();
	};
	const finishHeldAnimation = async () => {
		const waiting = heldAnimations.shift();
		if (!waiting?.onfinish)
			throw new Error("no transition is waiting to advance");
		waiting.onfinish();
		await settle();
	};

	return {
		band,
		wait,
		contentInset,
		scrollWrites: () => scrollWrites,
		unmount: view.unmount,
		disc: () => discWindow().querySelector("[data-refresh-disc]"),
		button: () => band().querySelector("button"),
		discClipBoxes: () =>
			[discWindow(), anchor()].map((box) => ({
				height: box.style.height,
				opacity: box.style.opacity,
			})),
		async setUpdating(updating: boolean) {
			await view.rerender({ updating });
			await settle();
		},
		async pullBandTo(px: number) {
			vi.advanceTimersByTime(FRAME_MS);
			scroller.dispatchEvent(
				new WheelEvent("wheel", { deltaY: -4 * intoContent }),
			);
			bandPx = px;
			scroller.dispatchEvent(new Event("scroll"));
			await settle();
		},
		async releaseBand() {
			scroller.dispatchEvent(new Event("scrollend"));
			bandPx = 0;
			scroller.dispatchEvent(new Event("scroll"));
			await settle();
		},
		async scrollIntoContent(px: number) {
			scrollTop += px * intoContent;
			scroller.dispatchEvent(new Event("scroll"));
			await settle();
		},
		async wheelWithoutBand() {
			scroller.dispatchEvent(
				new WheelEvent("wheel", { deltaY: -40 * intoContent }),
			);
			await new Promise((resolve) =>
				setTimeout(resolve, PAST_MOUSE_PROBE_MS),
			);
			await settle();
		},
		async contentFramesOver(frames: number) {
			const seen: ContentFrame[] = [];
			for (let index = 0; index < frames; index += 1) {
				await wait(FRAME_MS);
				seen.push({
					band: band().style.height,
					inset: contentInset(),
					restDistance: restDistance(),
				});
			}
			return seen;
		},
		async startDiscOutro() {
			await finishHeldAnimation();
			expect(outroEvents.at(-1)).toBe("outrostart");
		},
		async finishDiscOutro() {
			await finishHeldAnimation();
			expect(outroEvents.at(-1)).toBe("outroend");
		},
	};
}

describe("the refresh control", () => {
	beforeEach(() => {
		vi.useFakeTimers({
			toFake: [
				"requestAnimationFrame",
				"cancelAnimationFrame",
				"performance",
			],
		});
		heldAnimations = [];
		outroEvents = [];
		outroListeners = new AbortController();
		for (const type of ["outrostart", "outroend"])
			document.addEventListener(type, () => outroEvents.push(type), {
				capture: true,
				signal: outroListeners.signal,
			});
		vi.spyOn(Element.prototype, "animate").mockImplementation(() => {
			const animation = {
				cancel: () => {},
				currentTime: 0,
				playState: "running",
				effect: null,
				onfinish: null as (() => void) | null,
			};
			heldAnimations.push(animation);
			return animation as unknown as Animation;
		});
	});

	afterEach(() => {
		cleanup();
		document.body.replaceChildren();
		outroListeners.abort();
		vi.restoreAllMocks();
		vi.advanceTimersByTime(SHARED_FRAME_LOOP_DRAIN_MS);
		vi.useRealTimers();
	});

	it("shows the pull hint at the band's own height while the disc is still leaving", async () => {
		const view = await mountAtRest("top");
		await view.setUpdating(true);
		await view.setUpdating(false);
		await view.startDiscOutro();
		expect(outroEvents).toEqual(["outrostart"]);

		await view.pullBandTo(6);

		expect(view.disc()).not.toBeNull();
		expect(view.band().textContent?.trim()).toBe("Pull to refresh");
		expect(view.band().style.height).toBe("6px");
		expect(Number(view.band().style.opacity)).toBeLessThan(1);

		await view.pullBandTo(9);
		expect(view.band().style.height).toBe("9px");

		await view.finishDiscOutro();
		expect(outroEvents).toEqual(["outrostart", "outroend"]);
		expect(view.disc()).toBeNull();
		expect(view.band().style.height).toBe("9px");
	});

	it("keeps the disc's window open and opaque between the end of a refresh and the disc leaving", async () => {
		const view = await mountAtRest("top");
		await view.setUpdating(true);
		const whileRefreshing = view.discClipBoxes();

		await view.setUpdating(false);
		expect(outroEvents).toEqual([]);
		expect(view.disc()).not.toBeNull();
		expect(view.discClipBoxes()).toEqual(whileRefreshing);

		await view.wait(FRAME_MS);
		expect(outroEvents).toEqual([]);
		expect(view.discClipBoxes()).toEqual(whileRefreshing);

		await view.startDiscOutro();
		expect(outroEvents).toEqual(["outrostart"]);
		expect(view.disc()).not.toBeNull();
		expect(view.discClipBoxes()).toEqual(whileRefreshing);
	});

	it("opens no band space for a refresh that started elsewhere", async () => {
		const view = await mountAtRest("top");

		await view.setUpdating(true);
		const whileRefreshing = await view.contentFramesOver(TWEEN_FRAMES);
		await view.setUpdating(false);
		await view.startDiscOutro();
		await view.finishDiscOutro();
		const afterwards = await view.contentFramesOver(TWEEN_FRAMES);

		expect(outroEvents).toEqual(["outrostart", "outroend"]);
		expect(distinctBands(whileRefreshing)).toEqual(["0px"]);
		expect(distinctBands(afterwards)).toEqual(["0px"]);
	});

	it("puts the button back at its resting height while the disc of a clicked refresh is still leaving", async () => {
		const view = await mountAtRest("top");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);
		expect(view.band().style.height).toBe(BUTTON_REST_HEIGHT);

		view.button()!.click();
		await view.setUpdating(true);
		expect(view.disc()).not.toBeNull();
		expect(view.button()).toBeNull();

		await view.wait(MIN_REFRESHING_MS);
		await view.setUpdating(false);
		await view.startDiscOutro();

		expect(outroEvents).toEqual(["outrostart"]);
		expect(view.disc()).not.toBeNull();
		expect(view.button()).not.toBeNull();
		expect(view.band().style.height).toBe(BUTTON_REST_HEIGHT);
	});

	it("moves the list down in step with the resting button's own box", async () => {
		const view = await mountAtRest("top");
		expect(view.contentInset()).toBe("0px");

		await view.wheelWithoutBand();
		const opening = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctInsets(opening).length).toBeGreaterThan(2);
		for (const { band, inset } of opening) expect(inset).toBe(band);
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
		expect(view.button()).not.toBeNull();
	});

	it("lets the list back up once the reader scrolls away from the button", async () => {
		const view = await mountAtRest("top");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);

		await view.scrollIntoContent(10);
		const closing = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctInsets(closing).length).toBeGreaterThan(2);
		for (const { band, inset } of closing) expect(inset).toBe(band);
		expect(view.contentInset()).toBe("0px");
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
			await view.pullBandTo(px);
			whilePulling.push(view.contentInset());
		}
		expect(view.band().style.height).toBe("22px");
		await view.releaseBand();
		const afterRelease = await view.contentFramesOver(TWEEN_FRAMES);

		expect(view.disc()).not.toBeNull();
		expect(whilePulling).toEqual(["0px", "0px", "0px"]);
		expect(distinctInsets(afterRelease)).toEqual(["0px"]);
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

	it("takes its inset off the scroller when it unmounts", async () => {
		const view = await mountAtRest("top");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);

		view.unmount();
		await settle();

		expect(view.contentInset()).toBe("");
	});

	it("makes the same room above the composer without lifting a conversation off its floor", async () => {
		const view = await mountAtRest("bottom");
		expect(view.contentInset()).toBe("0px");

		await view.wheelWithoutBand();
		const opening = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctInsets(opening).length).toBeGreaterThan(2);
		for (const { restDistance } of opening)
			expect(restDistance).toBeLessThan(1);
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
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
	});

	it("gives the room above the composer back once a rubber band shows up, without scrolling under the band", async () => {
		const view = await mountAtRest("bottom");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);
		const scrollWritesBeforeBand = view.scrollWrites();
		expect(scrollWritesBeforeBand).toBeGreaterThan(0);

		await view.pullBandTo(6);
		const closing = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctInsets(closing).length).toBeGreaterThan(2);
		expect(view.contentInset()).toBe("0px");
		expect(view.scrollWrites()).toBe(scrollWritesBeforeBand);
	});
});
