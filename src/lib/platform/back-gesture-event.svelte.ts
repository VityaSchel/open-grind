import { createContext } from "svelte";
import { SvelteSet } from "svelte/reactivity";

export const backGestureEventHandlers = new SvelteSet<() => boolean>();

export function runBackGestureHandlers(): boolean {
	for (const handler of [...backGestureEventHandlers].reverse()) {
		if (handler() !== true) return true;
	}
	return false;
}

const [screenLeaving, setScreenLeaving, insideScreen] =
	createContext<() => boolean>();

export { setScreenLeaving };

export function dismissOnBackGesture({
	active,
	dismiss,
}: {
	active: () => boolean;
	dismiss: () => void;
}): void {
	const leaving = insideScreen() ? screenLeaving() : () => false;
	$effect(() => {
		if (leaving() || !active()) return;
		const handler = () => {
			dismiss();
			return false;
		};
		backGestureEventHandlers.add(handler);
		return () => {
			backGestureEventHandlers.delete(handler);
		};
	});
}
