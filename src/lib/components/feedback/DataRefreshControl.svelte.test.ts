// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataRefreshControl from "./DataRefreshControl.svelte";

const FRAME_MS = 16;
const TWEEN_FRAMES = 20;
const SHARED_FRAME_LOOP_DRAIN_MS = 300;
const PAST_MOUSE_PROBE_MS = 150;
const MIN_REFRESHING_MS = 500;
const BUTTON_REST_HEIGHT = "56px";

type HeldAnimation = { onfinish: (() => void) | null };

let heldAnimations: HeldAnimation[] = [];
let outroEvents: string[] = [];
let outroListeners = new AbortController();

async function settle() {
	for (let turn = 0; turn < 6; turn += 1) await tick();
}

async function mountAtTop() {
	const scroller = document.createElement("div");
	let bandPx = 0;
	Object.defineProperties(scroller, {
		scrollHeight: { value: 2000, configurable: true },
		clientHeight: { value: 500, configurable: true },
		scrollTop: { get: () => -bandPx, set: () => {}, configurable: true },
	});
	document.body.append(scroller);

	const view = render(DataRefreshControl, {
		props: { container: scroller, position: "top", updating: false },
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
			scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -4 }));
			bandPx = px;
			scroller.dispatchEvent(new Event("scroll"));
			await settle();
		},
		async wheelWithoutBand() {
			scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -40 }));
			await new Promise((resolve) =>
				setTimeout(resolve, PAST_MOUSE_PROBE_MS),
			);
			await settle();
		},
		async bandHeightsOver(frames: number) {
			const heights = new Set<string>();
			for (let index = 0; index < frames; index += 1) {
				await wait(FRAME_MS);
				heights.add(band().style.height);
			}
			return [...heights];
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

describe("the refresh control's layers", () => {
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
		const view = await mountAtTop();
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
		const view = await mountAtTop();
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
		const view = await mountAtTop();

		await view.setUpdating(true);
		const whileRefreshing = await view.bandHeightsOver(TWEEN_FRAMES);
		await view.setUpdating(false);
		await view.startDiscOutro();
		await view.finishDiscOutro();
		const afterwards = await view.bandHeightsOver(TWEEN_FRAMES);

		expect(outroEvents).toEqual(["outrostart", "outroend"]);
		expect(whileRefreshing).toEqual(["0px"]);
		expect(afterwards).toEqual(["0px"]);
	});

	it("puts the button back at its resting height while the disc of a clicked refresh is still leaving", async () => {
		const view = await mountAtTop();
		await view.wheelWithoutBand();
		await view.bandHeightsOver(TWEEN_FRAMES);
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
});
