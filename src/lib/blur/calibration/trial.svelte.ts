import {
	preferencesSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import { isLinuxPlatform } from "$lib/platform/os";
import { consumesScrollKeys, scrollKeys } from "$lib/util/scroll-keys";
import { webviewEngine } from "../compositing.svelte";
import {
	ARM_MIN_EVENTS,
	ARM_TRAVEL_PX,
	GESTURE_QUIET_MS,
	INPUT_GRACE_MS,
	INPUT_SLOP_PX,
	MIN_GESTURE_FRAMES,
	MIN_GESTURE_TRAVEL_PX,
	PAIR_MAX_AGE_MS,
	SETTLE_FRAMES,
	STALLED_GESTURE_MIN_MS,
} from "./constants";
import {
	type AutoQuality,
	type BackdropBlurCalibration,
	firstRung,
	nextStep,
	otherArm,
	pairFirstArm,
	type Rung,
	type TrialSample,
} from "./decide";
import { CLIP_MS, clippedMeanMs } from "./gesture";

type Point = { x: number; y: number };

type PendingGesture = {
	phase: "pending";
	scroller: Element;
	openTop: number;
	events: number;
	lastScrollAt: number;
};

type ArmedGesture = {
	phase: "armed";
	scroller: Element;
	arm: AutoQuality;
	startTop: number;
	armedAt: number;
	lastScrollAt: number;
	frames: number;
	previousTimestamp: number;
	intervals: number[];
};

type IgnoredGesture = { phase: "ignored"; lastScrollAt: number };

type Gesture = PendingGesture | ArmedGesture | IgnoredGesture;

type PairHalf = {
	arm: AutoQuality;
	meanMs: number;
	at: number;
	scroller: WeakRef<Element>;
};

let arm = $state<AutoQuality | null>(null);
let running = false;
let listeners: AbortController | null = null;
let rung: Rung = "max";
let samples: TrialSample[] = [];
let verdictToApplyUnderMotion: AutoQuality | null = null;
let half: PairHalf | null = null;
let gesture: Gesture | null = null;
let frameHandle = 0;
let lastInputAt = Number.NEGATIVE_INFINITY;
let inputOrigin: Point = { x: 0, y: 0 };

export function backdropBlurTrialArm(): AutoQuality | null {
	return arm;
}

export function calibratesFromLow(): boolean {
	return isLinuxPlatform();
}

export function engineCalibration(): BackdropBlurCalibration | null {
	const stored = preferencesSnapshot().backdropBlurCalibration;
	return stored?.engine === webviewEngine() ? stored : null;
}

function persist(quality: AutoQuality | null): void {
	void setPreferences({
		backdropBlurCalibration: {
			quality,
			rung,
			engine: webviewEngine(),
			samples,
		},
	}).catch((error: unknown) => {
		console.error("Failed to store backdrop blur calibration", error);
	});
}

function commitVerdict(quality: AutoQuality): void {
	verdictToApplyUnderMotion = null;
	arm = quality;
	persist(quality);
}

function noteInputMove(point: Point): void {
	if (
		Math.abs(point.x - inputOrigin.x) < INPUT_SLOP_PX &&
		Math.abs(point.y - inputOrigin.y) < INPUT_SLOP_PX
	) {
		return;
	}
	lastInputAt = performance.now();
}

function onTouchStart(event: TouchEvent): void {
	const touch = event.touches[0];
	if (touch === undefined) return;
	inputOrigin = { x: touch.clientX, y: touch.clientY };
}

function onTouchMove(event: TouchEvent): void {
	const touch = event.touches[0];
	if (touch === undefined) return;
	noteInputMove({ x: touch.clientX, y: touch.clientY });
}

function onPointerDown(event: PointerEvent): void {
	inputOrigin = { x: event.clientX, y: event.clientY };
}

function onPointerMove(event: PointerEvent): void {
	if (event.buttons === 0) return;
	noteInputMove({ x: event.clientX, y: event.clientY });
}

function onWheel(): void {
	lastInputAt = performance.now();
}

function onKeyDown(event: KeyboardEvent): void {
	if (!scrollKeys.has(event.key)) return;
	if (consumesScrollKeys(event.target)) return;
	lastInputAt = performance.now();
}

function modalOpen(): boolean {
	return document.querySelector('[data-slot$="-overlay"]') !== null;
}

function blurBandPaintsOver(scroller: Element): boolean {
	const bounds = scroller.getBoundingClientRect();
	for (const band of document.querySelectorAll(".pblur")) {
		const rect = band.getBoundingClientRect();
		const left = Math.max(rect.left, bounds.left);
		const right = Math.min(rect.right, bounds.right);
		const top = Math.max(rect.top, bounds.top);
		const bottom = Math.min(rect.bottom, bounds.bottom);
		if (left >= right || top >= bottom) continue;
		const hit = document.elementFromPoint(
			(left + right) / 2,
			(top + bottom) / 2,
		);
		if (hit !== null && (band === hit || band.contains(hit))) return true;
	}
	return false;
}

function measurable(scroller: Element): boolean {
	return !modalOpen() && blurBandPaintsOver(scroller);
}

function openGesture({
	scroller,
	now,
}: {
	scroller: Element;
	now: number;
}): PendingGesture {
	return {
		phase: "pending",
		scroller,
		openTop: scroller.scrollTop,
		events: 1,
		lastScrollAt: now,
	};
}

function armGesture(pending: PendingGesture): Gesture {
	const ignored: IgnoredGesture = {
		phase: "ignored",
		lastScrollAt: pending.lastScrollAt,
	};
	if (verdictToApplyUnderMotion !== null) {
		commitVerdict(verdictToApplyUnderMotion);
		return ignored;
	}
	if (!measurable(pending.scroller)) return ignored;
	const nextArm =
		half === null
			? pairFirstArm({ rung, pairIndex: samples.length })
			: otherArm({ rung, arm: half.arm });
	arm = nextArm;
	frameHandle = requestAnimationFrame(onFrame);
	return {
		phase: "armed",
		scroller: pending.scroller,
		arm: nextArm,
		startTop: pending.scroller.scrollTop,
		armedAt: pending.lastScrollAt,
		lastScrollAt: pending.lastScrollAt,
		frames: 0,
		previousTimestamp: Number.NaN,
		intervals: [],
	};
}

function advancePending({
	pending,
	scroller,
}: {
	pending: PendingGesture;
	scroller: Element;
}): void {
	if (pending.scroller !== scroller) {
		pending.scroller = scroller;
		pending.openTop = scroller.scrollTop;
		pending.events = 1;
		return;
	}
	pending.events += 1;
	if (pending.events < ARM_MIN_EVENTS) return;
	if (Math.abs(scroller.scrollTop - pending.openTop) < ARM_TRAVEL_PX) return;
	gesture = armGesture(pending);
}

function onFrame(timestamp: number): void {
	const open = gesture;
	if (open?.phase !== "armed") return;
	open.frames += 1;
	if (
		open.frames > SETTLE_FRAMES &&
		Number.isFinite(open.previousTimestamp)
	) {
		open.intervals.push(timestamp - open.previousTimestamp);
	}
	open.previousTimestamp = timestamp;
	if (timestamp - open.lastScrollAt > GESTURE_QUIET_MS) {
		endGesture(timestamp);
		return;
	}
	frameHandle = requestAnimationFrame(onFrame);
}

function endGesture(now: number): void {
	const open = gesture;
	gesture = null;
	cancelAnimationFrame(frameHandle);
	frameHandle = 0;
	if (open?.phase !== "armed") return;
	if (document.visibilityState !== "visible") return;
	if (!open.scroller.isConnected) return;
	const travel = Math.abs(open.scroller.scrollTop - open.startTop);
	if (travel < MIN_GESTURE_TRAVEL_PX) return;
	const meanMs = gestureMeanMs({ gesture: open, now });
	if (meanMs === null) return;
	recordHalf({
		arm: open.arm,
		meanMs,
		at: now,
		scroller: new WeakRef(open.scroller),
	});
	if (meanMs === CLIP_MS) leaveStalledArm();
}

function leaveStalledArm(): void {
	if (verdictToApplyUnderMotion !== null)
		commitVerdict(verdictToApplyUnderMotion);
	else if (running) arm = "min";
}

function gestureMeanMs({
	gesture,
	now,
}: {
	gesture: ArmedGesture;
	now: number;
}): number | null {
	if (gesture.intervals.length >= MIN_GESTURE_FRAMES)
		return clippedMeanMs(gesture.intervals);
	const span = now - gesture.armedAt;
	const stalled =
		span >= STALLED_GESTURE_MIN_MS &&
		span / Math.max(1, gesture.frames) >= CLIP_MS;
	return stalled ? CLIP_MS : null;
}

function settle(): AutoQuality | null {
	const step = nextStep({ rung, samples, climbing: calibratesFromLow() });
	if (step === null) return null;
	if ("settle" in step) return step.settle;
	rung = step.rung;
	samples = [];
	half = null;
	return null;
}

function recordHalf(next: PairHalf): void {
	const previous = half;
	const pairs =
		previous !== null &&
		previous.arm !== next.arm &&
		next.at - previous.at <= PAIR_MAX_AGE_MS &&
		previous.scroller.deref() === next.scroller.deref();
	if (!pairs) {
		half = next;
		return;
	}
	half = null;
	const upperHalf = next.arm === rung ? next : previous;
	const lowerHalf = next.arm === rung ? previous : next;
	samples = [...samples, [upperHalf.meanMs, lowerHalf.meanMs]];
	const quality = settle();
	if (quality === null || quality === arm) {
		persist(quality);
		return;
	}
	verdictToApplyUnderMotion = quality;
	persist(null);
}

function onScroll(event: Event): void {
	const now = performance.now();
	const target = event.target;
	const scroller =
		target instanceof Element ? target : document.scrollingElement;
	if (scroller === null) return;
	if (gesture !== null && now - gesture.lastScrollAt <= GESTURE_QUIET_MS) {
		gesture.lastScrollAt = now;
		if (gesture.phase === "pending") {
			advancePending({ pending: gesture, scroller });
		}
		return;
	}
	if (gesture !== null) endGesture(now);
	if (now - lastInputAt > INPUT_GRACE_MS) return;
	gesture = openGesture({ scroller, now });
}

function onVisibilityChange(): void {
	if (document.visibilityState === "visible") return;
	abortBackdropBlurTrialGesture();
}

export function abortBackdropBlurTrialGesture(): void {
	gesture = null;
	half = null;
	cancelAnimationFrame(frameHandle);
	frameHandle = 0;
}

function listen(): void {
	listeners = new AbortController();
	const options = { capture: true, passive: true, signal: listeners.signal };
	document.addEventListener("scroll", onScroll, options);
	document.addEventListener("touchstart", onTouchStart, options);
	document.addEventListener("touchmove", onTouchMove, options);
	document.addEventListener("pointerdown", onPointerDown, options);
	document.addEventListener("pointermove", onPointerMove, options);
	document.addEventListener("wheel", onWheel, options);
	document.addEventListener("keydown", onKeyDown, options);
	document.addEventListener("visibilitychange", onVisibilityChange, options);
}

function start(): void {
	running = true;
	const stored = engineCalibration();
	rung = stored?.rung ?? firstRung({ climbing: calibratesFromLow() });
	samples = stored?.samples ?? [];
	const quality = settle();
	if (quality !== null) {
		commitVerdict(quality);
		return;
	}
	listen();
}

function stop(): void {
	running = false;
	listeners?.abort();
	listeners = null;
	abortBackdropBlurTrialGesture();
	verdictToApplyUnderMotion = null;
	samples = [];
	arm = null;
}

export function syncBackdropBlurTrial({ needed }: { needed: boolean }): void {
	if (needed === running) return;
	if (needed) start();
	else stop();
}
