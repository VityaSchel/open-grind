import { invoke } from "@tauri-apps/api/core";
import type { Attachment } from "svelte/attachments";

import { currentPlatform } from "#lib/platform/os.ts";
import { notePageFollowsSoftKeyboard } from "#lib/platform/soft-keyboard.svelte.ts";
import { remeasureScreenChrome } from "#lib/util/screen-chrome.svelte.ts";
import { typesText } from "#lib/util/text-entry.ts";

const KEYFRAMES = 32;
const SETTLED_PX = 0.5;
const CURVE_PRECISION = 1e-6;

export type KeyboardCurve = [x1: number, y1: number, x2: number, y2: number];

export type KeyboardMotion = {
	from: number;
	to: number;
	duration: number;
	startedAt: number;
	curve: KeyboardCurve;
};

type Travel = KeyboardMotion & { start: number };

type CloseWait = {
	settleMs: number;
	timeout: ReturnType<typeof setTimeout> | undefined;
	resolve: () => void;
};

const followers = new Map<HTMLElement, KeyboardFollower>();
const closeWaits = new Set<CloseWait>();
let travel: Travel | undefined;
let following = false;

function bezierAxis(t: number, first: number, second: number): number {
	const inverse = 1 - t;
	return (
		3 * inverse * inverse * t * first +
		3 * inverse * t * t * second +
		t ** 3
	);
}

function easedProgress(
	[x1, y1, x2, y2]: KeyboardCurve,
	progress: number,
): number {
	if (progress <= 0) return 0;
	if (progress >= 1) return 1;
	let low = 0;
	let high = 1;
	while (high - low > CURVE_PRECISION) {
		const middle = (low + high) / 2;
		if (bezierAxis(middle, x1, x2) < progress) low = middle;
		else high = middle;
	}
	return bezierAxis((low + high) / 2, y1, y2);
}

function overlapAt(journey: Travel, progress: number): number {
	return (
		journey.start +
		(journey.to - journey.start) * easedProgress(journey.curve, progress)
	);
}

function progressAt(journey: Travel, now: number): number {
	return journey.duration > 0
		? (now - journey.startedAt) / journey.duration
		: 1;
}

function runningTravel(now: number): Travel | undefined {
	return travel && progressAt(travel, now) < 1 ? travel : undefined;
}

function closingRide(): Travel | undefined {
	const running = runningTravel(Date.now());
	return running && running.to <= 0 ? running : undefined;
}

function endCloseWait(wait: CloseWait) {
	clearTimeout(wait.timeout);
	closeWaits.delete(wait);
	wait.resolve();
}

function endCloseWaits() {
	for (const wait of closeWaits) endCloseWait(wait);
}

function armCloseWait(wait: CloseWait) {
	clearTimeout(wait.timeout);
	const ride = closingRide();
	const remaining = ride ? ride.startedAt + ride.duration - Date.now() : 0;
	wait.timeout = setTimeout(
		() => endCloseWait(wait),
		Math.max(remaining, 0) + wait.settleMs,
	);
}

function rideEnded(journey: Travel) {
	if (journey === travel && journey.to <= 0) endCloseWaits();
}

function restClearance(element: HTMLElement): number {
	const host = element.parentElement;
	if (!host) return 0;
	return Math.max(
		window.innerHeight - host.getBoundingClientRect().bottom,
		0,
	);
}

class KeyboardFollower {
	readonly #element: HTMLElement;
	#animation: Animation | undefined;
	#lift = 0;

	constructor({ element }: { element: HTMLElement }) {
		this.#element = element;
	}

	rest() {
		this.#stopRide();
		this.#settle(0);
	}

	ride(journey: Travel) {
		this.#stopRide();
		const clearance = restClearance(this.#element);
		const liftAbove = (overlap: number) => Math.max(overlap - clearance, 0);
		const target = liftAbove(journey.to);
		if (target < this.#lift) this.#settle(target);
		const elapsed = Date.now() - journey.startedAt;
		const offsets = Array.from(
			{ length: KEYFRAMES + 1 },
			(_, index) =>
				this.#lift - liftAbove(overlapAt(journey, index / KEYFRAMES)),
		);
		const still = offsets.every((offset) => Math.abs(offset) < SETTLED_PX);
		if (still || elapsed >= journey.duration) {
			this.#land({ lift: target, journey });
			return;
		}
		const animation = this.#element.animate(
			offsets.map((offset, index) => ({
				transform: `translateY(${offset}px)`,
				offset: index / KEYFRAMES,
			})),
			{ duration: journey.duration, easing: "linear", fill: "both" },
		);
		animation.startTime = performance.now() - elapsed;
		animation.addEventListener("finish", () => {
			if (this.#animation === animation)
				this.#land({ lift: target, journey });
		});
		this.#animation = animation;
	}

	#settle(lift: number) {
		this.#lift = lift;
		if (lift > 0) this.#element.style.marginBottom = `${lift}px`;
		else this.#element.style.removeProperty("margin-bottom");
	}

	#stopRide() {
		this.#animation?.cancel();
		this.#animation = undefined;
	}

	#land({ lift, journey }: { lift: number; journey: Travel }) {
		this.#settle(lift);
		this.#stopRide();
		remeasureScreenChrome();
		rideEnded(journey);
	}
}

function followMotion(motion: KeyboardMotion) {
	if (!following) return;
	const now = Date.now();
	const running = runningTravel(now);
	const journey: Travel = {
		...motion,
		start: running
			? overlapAt(running, progressAt(running, now))
			: motion.from,
	};
	travel = journey;
	if (journey.to <= 0) for (const wait of closeWaits) armCloseWait(wait);
	for (const follower of followers.values()) follower.ride(journey);
}

function letPageFollow(follow: boolean) {
	if (following === follow) return;
	following = follow;
	notePageFollowsSoftKeyboard(follow);
	if (!follow) {
		travel = undefined;
		for (const follower of followers.values()) follower.rest();
		endCloseWaits();
	}
	invoke("set_keyboard_follow", { follow }).catch((error: unknown) => {
		console.error("Failed to hand the keyboard to the page", error);
	});
}

function insideFollower(target: Node): boolean {
	for (const element of followers.keys())
		if (element.contains(target)) return true;
	return false;
}

function followFocus(event: FocusEvent) {
	if (!typesText(event.target)) return;
	letPageFollow(insideFollower(event.target));
}

function followBlur(event: FocusEvent) {
	if (!typesText(event.target) || insideFollower(event.target)) return;
	if (typesText(event.relatedTarget)) return;
	letPageFollow(true);
}

function stopFollowingWithoutFollowers() {
	if (followers.size === 0) letPageFollow(false);
}

function followIosKeyboard(element: HTMLElement): () => void {
	const follower = new KeyboardFollower({ element });
	followers.set(element, follower);
	if (followers.size === 1) {
		window.__iosKeyboardMotion = followMotion;
		document.addEventListener("focusin", followFocus);
		document.addEventListener("focusout", followBlur);
	}
	if (following && travel) follower.ride(travel);
	else if (followers.size === 1) letPageFollow(true);
	return () => {
		follower.rest();
		followers.delete(element);
		if (followers.size > 0) return;
		delete window.__iosKeyboardMotion;
		document.removeEventListener("focusin", followFocus);
		document.removeEventListener("focusout", followBlur);
		queueMicrotask(stopFollowingWithoutFollowers);
	};
}

export const followSoftKeyboard: Attachment<HTMLElement> = (element) => {
	switch (currentPlatform()) {
		case "ios":
			return followIosKeyboard(element);
		case "android":
		case "linux":
		case "macos":
		case "windows":
			return;
	}
};

export function followedKeyboardMoving(): boolean {
	return following && runningTravel(Date.now()) !== undefined;
}

export function followedKeyboardClosed({
	settleMs,
}: {
	settleMs: number;
}): Promise<void> | undefined {
	if (!following) return undefined;
	if (travel && travel.to <= 0 && !closingRide()) return Promise.resolve();
	return new Promise((resolve) => {
		const wait: CloseWait = { settleMs, timeout: undefined, resolve };
		closeWaits.add(wait);
		armCloseWait(wait);
	});
}
