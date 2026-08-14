import { SvelteSet } from "svelte/reactivity";

export const backGestureEventHandlers = new SvelteSet<() => boolean>();

export function dismissOnBackGesture({
	active,
	dismiss,
}: {
	active: () => boolean;
	dismiss: () => void;
}): void {
	$effect(() => {
		if (!active()) return;
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
