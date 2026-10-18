import { createContext } from "svelte";
import { SvelteMap } from "svelte/reactivity";

export type BackGestureLayer = "stack" | "screen" | "overlay";

type BackGestureHandler = () => boolean;

const LAYERS_TOP_FIRST: readonly BackGestureLayer[] = [
	"overlay",
	"screen",
	"stack",
];

export const backGestureEventHandlers = new SvelteMap<
	BackGestureHandler,
	BackGestureLayer
>();

function backGestureHandlersTopFirst(): BackGestureHandler[] {
	const newestFirst = [...backGestureEventHandlers].reverse();
	return LAYERS_TOP_FIRST.flatMap((layer) =>
		newestFirst
			.filter(([, handlerLayer]) => handlerLayer === layer)
			.map(([handler]) => handler),
	);
}

export function topBackGestureHandler(): BackGestureHandler | undefined {
	return backGestureHandlersTopFirst()[0];
}

export function runBackGestureHandlers(): boolean {
	for (const handler of backGestureHandlersTopFirst()) {
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
	layer = "overlay",
}: {
	active: () => boolean;
	dismiss: () => void;
	layer?: BackGestureLayer;
}): void {
	const leaving = insideScreen() ? screenLeaving() : () => false;
	$effect(() => {
		if (leaving() || !active()) return;
		const handler = () => {
			dismiss();
			return false;
		};
		backGestureEventHandlers.set(handler, layer);
		return () => {
			backGestureEventHandlers.delete(handler);
		};
	});
}
