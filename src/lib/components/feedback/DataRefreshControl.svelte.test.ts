// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import DataRefreshControl from "./DataRefreshControl.svelte";

const FRAME_MS = 16;
const TWEEN_FRAMES = 20;
const TWEEN_MS = TWEEN_FRAMES * FRAME_MS;
const SHARED_FRAME_LOOP_DRAIN_MS = 300;
const PAST_MOUSE_PROBE_MS = 150;
const STALE_KEY_MS = 600;
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

	const onrefresh = vi.fn();
	const view = render(DataRefreshControl, {
		props: {
			container: scroller,
			position: edge,
			updating: false,
			onrefresh,
		},
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
		onrefresh,
		phase: () => anchor().dataset.refreshPhase,
		bandText: () => band().textContent?.trim(),
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
		async moveBandTo({
			px,
			pulledByWheel,
		}: {
			px: number;
			pulledByWheel: boolean;
		}) {
			vi.advanceTimersByTime(FRAME_MS);
			if (pulledByWheel)
				scroller.dispatchEvent(
					new WheelEvent("wheel", { deltaY: -4 * intoContent }),
				);
			bandPx = px;
			scroller.dispatchEvent(new Event("scroll"));
			await settle();
		},
		async pressInsideList(key: string) {
			scroller.dispatchEvent(
				new KeyboardEvent("keydown", { key, bubbles: true }),
			);
			await settle();
		},
		async pressOutsideList(key: string) {
			document.body.dispatchEvent(
				new KeyboardEvent("keydown", { key, bubbles: true }),
			);
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

	afterEach(async () => {
		cleanup();
		document.body.replaceChildren();
		outroListeners.abort();
		vi.restoreAllMocks();
		vi.advanceTimersByTime(SHARED_FRAME_LOOP_DRAIN_MS);
		vi.useRealTimers();
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("shows the pull hint at the band's own height while the disc is still leaving", async () => {
		const view = await mountAtRest("top");
		await view.setUpdating(true);
		await view.setUpdating(false);
		await view.startDiscOutro();
		expect(outroEvents).toEqual(["outrostart"]);

		await view.moveBandTo({ px: 6, pulledByWheel: true });

		expect(view.disc()).not.toBeNull();
		expect(view.bandText()).toBe("Pull to refresh");
		expect(view.band().style.height).toBe("6px");
		expect(Number(view.band().style.opacity)).toBeLessThan(1);

		await view.moveBandTo({ px: 9, pulledByWheel: true });
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
			await view.moveBandTo({ px: px, pulledByWheel: true });
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

		await view.moveBandTo({ px: 6, pulledByWheel: true });
		const closing = await view.contentFramesOver(TWEEN_FRAMES);

		expect(distinctInsets(closing).length).toBeGreaterThan(2);
		expect(view.contentInset()).toBe("0px");
		expect(view.scrollWrites()).toBe(scrollWritesBeforeBand);
	});

	it("shows the pull hint and no button for a band that no wheel comes with", async () => {
		const view = await mountAtRest("top");

		await view.moveBandTo({ px: 6, pulledByWheel: false });

		expect(view.phase()).toBe("pulling");
		expect(view.bandText()).toBe("Pull to refresh");
		expect(view.button()).toBeNull();
		expect(view.contentInset()).toBe("0px");
	});

	it("offers the button instead of the pull hint for a band that a scroll key drives, and never refreshes", async () => {
		const view = await mountAtRest("top");
		const whileBanding: { phase?: string; bandText?: string }[] = [];
		await view.pressOutsideList("PageUp");

		for (const px of [6, 22]) {
			await view.moveBandTo({ px: px, pulledByWheel: false });
			whileBanding.push({
				phase: view.phase(),
				bandText: view.bandText(),
			});
		}
		await view.releaseBand();
		await view.wait(TWEEN_MS);

		expect(whileBanding).toEqual([
			{ phase: "idle", bandText: "Refresh" },
			{ phase: "idle", bandText: "Refresh" },
		]);
		expect(view.phase()).toBe("idle");
		expect(view.onrefresh).not.toHaveBeenCalled();
		expect(view.button()).not.toBeNull();
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
	});

	it("goes back to the pull hint at the next band once the key press is stale", async () => {
		const view = await mountAtRest("top");
		await view.pressOutsideList("PageUp");
		await view.moveBandTo({ px: 6, pulledByWheel: false });
		await view.releaseBand();
		await view.wait(STALE_KEY_MS);
		expect(view.button()).not.toBeNull();

		await view.moveBandTo({ px: 6, pulledByWheel: false });

		expect(view.phase()).toBe("pulling");
		expect(view.bandText()).toBe("Pull to refresh");
		expect(view.button()).toBeNull();
	});

	it("offers the button for a key that scrolls toward the edge the list already rests at", async () => {
		const view = await mountAtRest("top");

		await view.pressInsideList("ArrowDown");
		const afterKeyIntoContent = await view.contentFramesOver(TWEEN_FRAMES);
		await view.pressInsideList("ArrowUp");
		await view.wait(TWEEN_MS);

		expect(distinctInsets(afterKeyIntoContent)).toEqual(["0px"]);
		expect(view.button()).not.toBeNull();
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
	});

	it("rewords the pull and release hints when the locale changes", async () => {
		const view = await mountAtRest("top");
		await view.moveBandTo({ px: 6, pulledByWheel: true });

		await setLocale({ locale: "en-XA" });
		await settle();
		const pulling = view.bandText();
		await view.moveBandTo({ px: 22, pulledByWheel: true });
		const armed = view.bandText();

		expect(pulling).toBe(t("shell.dataRefreshControl.pullHint"));
		expect(armed).toBe(t("shell.dataRefreshControl.releaseHint"));
		for (const hint of [pulling, armed])
			expect(hint).toMatch(PSEUDO_MESSAGE);
	});

	it("renames the resting button when the locale changes", async () => {
		const view = await mountAtRest("top");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);

		await setLocale({ locale: "en-XA" });
		await settle();

		expect(view.bandText()).toBe(
			t("shell.dataRefreshControl.refreshButton"),
		);
		expect(view.bandText()).toMatch(PSEUDO_MESSAGE);
	});
});
