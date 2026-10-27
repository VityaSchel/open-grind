import { androidSystemBack } from "$lib/platform/android-native-bridge";
import {
	backGestureEventHandlers,
	topBackGestureHandler,
} from "$lib/platform/back-gesture-event.svelte";
import { currentPlatform } from "$lib/platform/os";

export type SwipeBackStack = {
	readonly tracking: boolean;
	beginSwipeBack(): boolean;
	trackSwipeBack(progress: number): void;
	commitSwipeBack(): void;
	cancelSwipeBack(): void;
};

export type SystemBackGesture = { start: () => boolean; cancel: () => void };

export type SystemBackAdapter = {
	install: () => void;
	readProgress: () => number | undefined;
	expose: (gesture: SystemBackGesture) => () => void;
};

const noSystemBack: SystemBackAdapter = {
	install: () => {},
	readProgress: () => undefined,
	expose: () => () => {},
};

function platformSystemBack(): SystemBackAdapter {
	switch (currentPlatform()) {
		case "android":
			return androidSystemBack;
		case "ios":
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

	const ownsTheGesture = () => topBackGestureHandler() === commitInFlight;

	const start = () => {
		if (!ownsTheGesture() || !stack.beginSwipeBack()) return false;
		frame = requestAnimationFrame(followProgress);
		return true;
	};
	const cancel = () => {
		stopReading();
		stack.cancelSwipeBack();
	};
	const unexpose = systemBack.expose({ start, cancel });
	backGestureEventHandlers.set(commitInFlight, "stack");

	return () => {
		stopReading();
		backGestureEventHandlers.delete(commitInFlight);
		unexpose();
	};
}
