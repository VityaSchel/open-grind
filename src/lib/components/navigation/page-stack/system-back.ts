import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";

export type SystemBackTarget = {
	begin: () => boolean;
	track: (progress: number) => void;
	commit: () => void;
	cancel: () => void;
	tracking: () => boolean;
};

export function attachSystemBackGesture(target: SystemBackTarget): () => void {
	let frame: number | undefined;

	const stopReading = () => {
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = undefined;
	};

	const readProgress = () => {
		if (!target.tracking()) {
			stopReading();
			return;
		}
		const progress = window.__AndroidBack?.gestureProgress();
		if (progress !== undefined) target.track(progress);
		frame = requestAnimationFrame(readProgress);
	};

	const commitInFlight = () => {
		if (!target.tracking()) return true;
		stopReading();
		target.commit();
		return false;
	};

	const ownsTheGesture = () =>
		[...backGestureEventHandlers].at(-1) === commitInFlight;

	const start = () => {
		if (!ownsTheGesture() || !target.begin()) return false;
		frame = requestAnimationFrame(readProgress);
		return true;
	};
	const cancel = () => {
		stopReading();
		target.cancel();
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
