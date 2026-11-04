import { androidSystemBack } from "#lib/platform/android-native-bridge.ts";
import {
	backGestureEventHandlers,
	type BackGestureLayer,
	topBackGestureHandler,
} from "#lib/platform/back-gesture-event.svelte.ts";
import { iosSystemBack } from "#lib/platform/ios-native-bridge.ts";
import { currentPlatform } from "#lib/platform/os.ts";

export type SwipeRelease = { velocity: number };

export type SwipeBackStack = {
	readonly tracking: boolean;
	readonly canBeginSwipeBack: boolean;
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
	expose: (gesture: SystemBackGesture) => () => void;
	arm: (arming: { gesture: SystemBackGesture; armed: boolean }) => void;
};

const noSystemBack: SystemBackAdapter = {
	passesOver: [],
	install: () => {},
	readProgress: () => undefined,
	expose: () => () => {},
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

export function installSystemBack(): void {
	platformSystemBack().install();
}

export function attachSystemBackGesture(stack: SwipeBackStack): () => void {
	const systemBack = platformSystemBack();
	let frame: number | undefined;

	const stopReading = () => {
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = undefined;
	};

	const followProgress = () => {
		if (!stack.tracking) {
			stopReading();
			return;
		}
		const progress = systemBack.readProgress();
		if (progress !== undefined) stack.trackSwipeBack(progress);
		frame = requestAnimationFrame(followProgress);
	};

	const commitInFlight = () => {
		if (!stack.tracking) return true;
		stopReading();
		stack.commitSwipeBack();
		return false;
	};

	const ownsTheGesture = () =>
		topBackGestureHandler({ skipping: systemBack.passesOver }) ===
		commitInFlight;

	const gesture: SystemBackGesture = {
		start: () => {
			if (!ownsTheGesture() || !stack.beginSwipeBack()) return false;
			frame = requestAnimationFrame(followProgress);
			return true;
		},
		cancel: () => {
			stopReading();
			stack.cancelSwipeBack();
		},
		finish: ({ commit, velocity }) => {
			if (!stack.tracking) return;
			stopReading();
			if (commit) stack.commitSwipeBack({ velocity });
			else stack.cancelSwipeBack({ velocity });
		},
		prepare: () => stack.prepareSwipeBack?.(),
	};
	const unexpose = systemBack.expose(gesture);
	backGestureEventHandlers.set(commitInFlight, "stack");
	const stopArming = $effect.root(() => {
		$effect(() => {
			systemBack.arm({
				gesture,
				armed: ownsTheGesture() && stack.canBeginSwipeBack,
			});
		});
	});

	return () => {
		stopReading();
		stopArming();
		backGestureEventHandlers.delete(commitInFlight);
		unexpose();
	};
}
