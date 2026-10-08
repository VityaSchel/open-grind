import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, expect, vi } from "vitest";

import DataRefreshControl from "./DataRefreshControl.svelte";
import { contentSlideRecorder } from "./refresh/content-slide-test-helpers";

export const FRAME_MS = 16;
export const TWEEN_FRAMES = 20;
export const TWEEN_MS = TWEEN_FRAMES * FRAME_MS;
export const SHARED_FRAME_LOOP_DRAIN_MS = 300;
export const PAST_MOUSE_PROBE_MS = 150;
export const STALE_KEY_MS = 600;
export const MIN_REFRESHING_MS = 500;
export const BUTTON_REST_PX = 56;
export const BUTTON_REST_HEIGHT = `${BUTTON_REST_PX}px`;
export const CONTENT_SLIDE_TIMING = {
	duration: 250,
	easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};
export const CONTENT_HEIGHT = 2000;
export const VIEWPORT_HEIGHT = 500;
export const SHORT_CONTENT_HEIGHT = 300;

export type Edge = "top" | "bottom";
export type ContentFrame = {
	band: string;
	inset: string;
	restDistance: number;
	contentTop: number;
};

export const distinctInsets = (frames: ContentFrame[]) => [
	...new Set(frames.map(({ inset }) => inset)),
];

export const distinctBands = (frames: ContentFrame[]) => [
	...new Set(frames.map(({ band }) => band)),
];

export type HeldAnimation = { onfinish: (() => void) | null };

let heldAnimations: HeldAnimation[] = [];
export let slideRecorder = contentSlideRecorder();
export let outroEvents: string[] = [];
let outroListeners = new AbortController();

export async function settle() {
	for (let turn = 0; turn < 6; turn += 1) await tick();
}

export async function mountAtRest(
	edge: Edge,
	{ floorRoundingPx = 0, contentHeight = CONTENT_HEIGHT } = {},
) {
	const scroller = document.createElement("div");
	const intoContent = edge === "top" ? 1 : -1;
	const contentInset = () =>
		scroller.style.getPropertyValue(`--refresh-inset-${edge}`);
	const maxScrollTop = () =>
		Math.max(
			0,
			contentHeight + (parseFloat(contentInset()) || 0) - VIEWPORT_HEIGHT,
		);
	const trueFloor = () => maxScrollTop() - floorRoundingPx;
	const restDistance = () =>
		edge === "top" ? scrollTop : trueFloor() - scrollTop;
	let bandPx = 0;
	let scrollWrites = 0;
	let scrollTop = edge === "top" ? 0 : trueFloor();
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
				scrollTop = Math.min(Math.max(0, top), trueFloor());
				scrollWrites += 1;
			},
			configurable: true,
		},
	});
	const content = document.createElement("div");
	content.dataset.refreshContent = "";
	const contentTop = () =>
		(edge === "top" ? parseFloat(contentInset()) || 0 : 0) -
		scroller.scrollTop +
		slideRecorder.offsetPx();
	Object.defineProperty(content, "getBoundingClientRect", {
		value: () =>
			({
				top: contentTop(),
				bottom: contentTop() + CONTENT_HEIGHT,
			}) as DOMRect,
	});
	scroller.append(content);
	document.body.append(scroller);

	const onrefresh = vi.fn();
	const oninsetchange = vi.fn();
	const view = render(DataRefreshControl, {
		props: {
			container: scroller,
			position: edge,
			updating: false,
			onrefresh,
			oninsetchange,
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
		contentTop,
		contentBottom: () => contentTop() + CONTENT_HEIGHT,
		slides: () => slideRecorder.slides(),
		insetChanges: () => oninsetchange.mock.calls.length,
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
		async wheelAwayWithoutScrolling() {
			scroller.dispatchEvent(
				new WheelEvent("wheel", { deltaY: 40 * intoContent }),
			);
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
					contentTop: contentTop(),
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

export function useRefreshControlHarness({
	reducedMotion,
}: {
	reducedMotion: { current: boolean };
}) {
	beforeEach(() => {
		vi.useFakeTimers({
			toFake: [
				"requestAnimationFrame",
				"cancelAnimationFrame",
				"performance",
			],
		});
		heldAnimations = [];
		slideRecorder = contentSlideRecorder();
		slideRecorder.installTimeline();
		reducedMotion.current = false;
		outroEvents = [];
		outroListeners = new AbortController();
		for (const type of ["outrostart", "outroend"])
			document.addEventListener(type, () => outroEvents.push(type), {
				capture: true,
				signal: outroListeners.signal,
			});
		vi.spyOn(Element.prototype, "animate").mockImplementation(function (
			this: Element,
			keyframes,
			timing,
		) {
			if (
				this instanceof HTMLElement &&
				this.dataset.refreshContent !== undefined
			)
				return slideRecorder.record({
					keyframes: keyframes as [Keyframe, Keyframe],
					timing: timing as KeyframeAnimationOptions,
				});
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
		slideRecorder.removeTimeline();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.advanceTimersByTime(SHARED_FRAME_LOOP_DRAIN_MS);
		vi.useRealTimers();
	});
}
