import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";

export type SwipeBackStack = {
	readonly tracking: boolean;
	beginSwipeBack(): boolean;
	trackSwipeBack(progress: number): void;
	commitSwipeBack(): void;
	cancelSwipeBack(): void;
};

export function attachSystemBackGesture(stack: SwipeBackStack): () => void {
	let frame: number | undefined;

	const stopReading = () => {
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = undefined;
	};

	const readProgress = () => {
		if (!stack.tracking) {
			stopReading();
			return;
		}
		const progress = window.__AndroidBack?.gestureProgress();
		if (progress !== undefined) stack.trackSwipeBack(progress);
		frame = requestAnimationFrame(readProgress);
	};

	const commitInFlight = () => {
		if (!stack.tracking) return true;
		stopReading();
		stack.commitSwipeBack();
		return false;
	};

	const ownsTheGesture = () =>
		[...backGestureEventHandlers].at(-1) === commitInFlight;

	const start = () => {
		if (!ownsTheGesture() || !stack.beginSwipeBack()) return false;
		frame = requestAnimationFrame(readProgress);
		return true;
	};
	const cancel = () => {
		stopReading();
		stack.cancelSwipeBack();
	};
	window.__AndroidOnBackGestureStart = start;
	window.__AndroidOnBackGestureCancel = cancel;
	backGestureEventHandlers.add(commitInFlight);

	return () => {
		stopReading();
		backGestureEventHandlers.delete(commitInFlight);
		if (window.__AndroidOnBackGestureStart === start)
			delete window.__AndroidOnBackGestureStart;
		if (window.__AndroidOnBackGestureCancel === cancel)
			delete window.__AndroidOnBackGestureCancel;
	};
}
