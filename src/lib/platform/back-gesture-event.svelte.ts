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

type LayerSkip = { skipping?: readonly BackGestureLayer[] };

function backGestureHandlersTopFirst({
	skipping = [],
}: LayerSkip = {}): BackGestureHandler[] {
	const newestFirst = [...backGestureEventHandlers].reverse();
	return LAYERS_TOP_FIRST.filter(
		(layer) => !skipping.includes(layer),
	).flatMap((layer) =>
		newestFirst
			.filter(([, handlerLayer]) => handlerLayer === layer)
			.map(([handler]) => handler),
	);
}

export function topBackGestureHandler(
	skip: LayerSkip = {},
): BackGestureHandler | undefined {
	return backGestureHandlersTopFirst(skip)[0];
}

export function overlayOpen(): boolean {
	return [...backGestureEventHandlers.values()].includes("overlay");
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
