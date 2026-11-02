import { invoke } from "@tauri-apps/api/core";
import type { Attachment } from "svelte/attachments";

import { currentPlatform } from "$lib/platform/os";
import { notePageFollowsSoftKeyboard } from "$lib/platform/soft-keyboard.svelte";
import { remeasureScreenChrome } from "$lib/util/screen-chrome.svelte";

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

type Follower = { animation: Animation | undefined; lift: number };

type CloseWait = {
	settleMs: number;
	timeout: ReturnType<typeof setTimeout> | undefined;
	resolve: () => void;
};

const followers = new Map<HTMLElement, Follower>();
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
	const clamped = Math.min(Math.max(progress, 0), 1);
	return (
		journey.start +
		(journey.to - journey.start) * easedProgress(journey.curve, clamped)
	);
}

function progressAt(journey: Travel, now: number): number {
	return journey.duration > 0
		? (now - journey.startedAt) / journey.duration
		: 1;
}

function closingRide(): Travel | undefined {
	if (!travel || travel.to > 0) return undefined;
	return progressAt(travel, Date.now()) < 1 ? travel : undefined;
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

function settle(element: HTMLElement, follower: Follower, lift: number) {
	follower.lift = lift;
	if (lift > 0) element.style.marginBottom = `${lift}px`;
	else element.style.removeProperty("margin-bottom");
}

function rest(element: HTMLElement, follower: Follower) {
	follower.animation?.cancel();
	follower.animation = undefined;
	settle(element, follower, 0);
}

function ride(element: HTMLElement, follower: Follower, journey: Travel) {
	follower.animation?.cancel();
	follower.animation = undefined;
	const clearance = restClearance(element);
	const liftAbove = (overlap: number) => Math.max(overlap - clearance, 0);
	const target = liftAbove(journey.to);
	if (target < follower.lift) settle(element, follower, target);
	const elapsed = Date.now() - journey.startedAt;
	const offsets = Array.from(
		{ length: KEYFRAMES + 1 },
		(_, index) =>
			follower.lift - liftAbove(overlapAt(journey, index / KEYFRAMES)),
	);
	const still = offsets.every((offset) => Math.abs(offset) < SETTLED_PX);
	if (still || elapsed >= journey.duration) {
		settle(element, follower, target);
		remeasureScreenChrome();
		rideEnded(journey);
		return;
	}
	const animation = element.animate(
		offsets.map((offset, index) => ({
			transform: `translateY(${offset}px)`,
			offset: index / KEYFRAMES,
		})),
		{ duration: journey.duration, easing: "linear", fill: "both" },
	);
	animation.startTime = performance.now() - elapsed;
	animation.addEventListener("finish", () => {
		if (follower.animation !== animation) return;
		settle(element, follower, target);
		animation.cancel();
		follower.animation = undefined;
		remeasureScreenChrome();
		rideEnded(journey);
	});
	follower.animation = animation;
}

function followMotion(motion: KeyboardMotion) {
	if (!following) return;
	const now = Date.now();
	const running = travel !== undefined && progressAt(travel, now) < 1;
	const journey: Travel = {
		...motion,
		start:
			running && travel
				? overlapAt(travel, progressAt(travel, now))
				: motion.from,
	};
	travel = journey;
	if (journey.to <= 0) for (const wait of closeWaits) armCloseWait(wait);
	for (const [element, follower] of followers)
		ride(element, follower, journey);
}

function letPageFollow(follow: boolean) {
	if (following === follow) return;
	following = follow;
	notePageFollowsSoftKeyboard(follow);
	if (!follow) {
		travel = undefined;
		for (const [element, follower] of followers) rest(element, follower);
		endCloseWaits();
	}
	invoke("set_keyboard_follow", { follow }).catch((error: unknown) => {
		console.error("Failed to hand the keyboard to the page", error);
	});
}

function typesText(target: EventTarget | null): target is HTMLElement {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
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
	const follower: Follower = { animation: undefined, lift: 0 };
	followers.set(element, follower);
	if (followers.size === 1) {
		window.__iosKeyboardMotion = followMotion;
		document.addEventListener("focusin", followFocus);
		document.addEventListener("focusout", followBlur);
	}
	if (following && travel) ride(element, follower, travel);
	else if (followers.size === 1) letPageFollow(true);
	return () => {
		rest(element, follower);
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
	return (
		following && travel !== undefined && progressAt(travel, Date.now()) < 1
	);
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
