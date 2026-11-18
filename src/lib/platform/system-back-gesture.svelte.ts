import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";

import { androidSystemBack } from "#lib/platform/android-system-back.ts";
import {
	backGestureEventHandlers,
	type BackGestureLayer,
	topBackGestureLayer,
} from "#lib/platform/back-gesture-event.svelte.ts";
import { iosSystemBack } from "#lib/platform/ios-system-back.ts";
import { currentPlatform } from "#lib/platform/os.ts";

export type SwipeRelease = { velocity: number };

export type SwipeBackStack = {
	readonly tracking: boolean;
	readonly moving: boolean;
	readonly offersSwipeBack: boolean;
	readonly covering?: boolean;
	beginSwipeBack(): boolean;
	trackSwipeBack(progress: number): void;
	commitSwipeBack(release?: SwipeRelease): void;
	cancelSwipeBack(release?: SwipeRelease): void;
	prepareSwipeBack?(): () => void;
};

export type SwipeBackRelease = { commit: boolean; velocity: number };

export type SystemBackGesture = {
	start: () => boolean;
	cancel: () => void;
	finish: (release: SwipeBackRelease) => void;
	prepare: () => (() => void) | undefined;
};

export type SystemBackAdapter = {
	readonly passesOver: readonly BackGestureLayer[];
	install: () => void;
	readProgress: () => number | undefined;
	expose: (gesture: SystemBackGesture) => void;
	arm: (arming: { gesture: SystemBackGesture; armed: boolean }) => void;
};

const attachedStacks = new SvelteSet<SwipeBackStack>();

export function stackInMotion(): boolean {
	return [...attachedStacks].some((stack) => stack.tracking || stack.moving);
}

const noSystemBack: SystemBackAdapter = {
	passesOver: [],
	install: () => {},
	readProgress: () => undefined,
	expose: () => {},
	arm: () => {},
};

function platformSystemBack(): SystemBackAdapter {
	switch (currentPlatform()) {
		case "android":
			return androidSystemBack;
		case "ios":
			return iosSystemBack;
		case "linux":
		case "macos":
		case "windows":
			return noSystemBack;
	}
}

function stacksNewestFirst(): SwipeBackStack[] {
	return [...attachedStacks].reverse();
}

function trackingStack(): SwipeBackStack | undefined {
	return stacksNewestFirst().find((stack) => stack.tracking);
}

function stackInCharge(): SwipeBackStack | undefined {
	const stacks = stacksNewestFirst();
	return (
		stacks.find((stack) => stack.covering) ??
		stacks.find((stack) => stack.tracking || stack.offersSwipeBack) ??
		stacks.find((stack) => stack.moving) ??
		stacks[0]
	);
}

function owningStack(): SwipeBackStack | undefined {
	const topLayer = topBackGestureLayer({
		skipping: platformSystemBack().passesOver,
	});
	const stack = topLayer === "stack" ? stackInCharge() : undefined;
	return stack?.covering ? undefined : stack;
}

function swipeArmed(): boolean {
	const owner = owningStack();
	return owner !== undefined && (owner.tracking || owner.offersSwipeBack);
}

let frame: number | undefined;

function stopReading(): void {
	if (frame !== undefined) cancelAnimationFrame(frame);
	frame = undefined;
}

function followProgress(): void {
	const stack = trackingStack();
	if (!stack) {
		stopReading();
		return;
	}
	const progress = platformSystemBack().readProgress();
	if (progress !== undefined) stack.trackSwipeBack(progress);
	frame = requestAnimationFrame(followProgress);
}

function commitInFlight(): boolean {
	const stack = trackingStack();
	if (!stack) return true;
	stopReading();
	stack.commitSwipeBack();
	return false;
}

const systemBackGesture: SystemBackGesture = {
	start: () => {
		if (!owningStack()?.beginSwipeBack()) return false;
		frame = requestAnimationFrame(followProgress);
		return true;
	},
	cancel: () => {
		stopReading();
		trackingStack()?.cancelSwipeBack();
	},
	finish: ({ commit, velocity }) => {
		const stack = trackingStack();
		if (!stack) return;
		stopReading();
		if (commit) stack.commitSwipeBack({ velocity });
		else stack.cancelSwipeBack({ velocity });
	},
	prepare: () => stackInCharge()?.prepareSwipeBack?.(),
};

function pushArm(): void {
	platformSystemBack().arm({
		gesture: systemBackGesture,
		armed: swipeArmed(),
	});
}

export function installSystemBack(): void {
	const systemBack = platformSystemBack();
	systemBack.install();
	systemBack.expose(systemBackGesture);
	untrack(pushArm);
}

export function attachSystemBackGesture(stack: SwipeBackStack): () => void {
	attachedStacks.add(stack);
	backGestureEventHandlers.set(commitInFlight, "stack");
	const stopArming = $effect.root(() => {
		$effect(pushArm);
	});

	return () => {
		stopArming();
		attachedStacks.delete(stack);
		untrack(() => {
			if (!trackingStack()) stopReading();
			if (attachedStacks.size === 0)
				backGestureEventHandlers.delete(commitInFlight);
			pushArm();
		});
	};
}
