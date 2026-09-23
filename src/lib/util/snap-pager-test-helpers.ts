import { vi } from "vitest";

import { ScrollGestureState } from "$lib/platform/scroll-gesture";
import { SnapPager } from "$lib/util/snap-pager";

export const WIDTH = 411.43;

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

export function fakePagerLayout({
	mount,
	touchTarget,
}: {
	mount: () => HTMLElement;
	touchTarget?: EventTarget;
}) {
	const resizeCallbacks = new Map<Element, ResizeCallback>();
	const disconnect = vi.fn();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			readonly #callback: ResizeCallback;
			constructor(callback: ResizeCallback) {
				this.#callback = callback;
			}
			observe(target: Element) {
				resizeCallbacks.set(target, this.#callback);
			}
			unobserve() {}
			disconnect = disconnect;
		},
	);

	const node = mount();
	let layoutWidth = WIDTH;
	Object.defineProperty(node, "clientWidth", {
		get: () => Math.round(layoutWidth),
	});
	const scrollTo = vi.spyOn(node, "scrollTo");

	const touchesOnScreen = new Set<number>();
	const touch = (
		type: "touchstart" | "touchend" | "touchcancel",
		{
			id = 0,
			target = touchTarget ?? node,
		}: { id?: number; target?: EventTarget } = {},
	) => {
		if (type === "touchstart") touchesOnScreen.add(id);
		else touchesOnScreen.delete(id);
		const event = new Event(type, { bubbles: true });
		Object.defineProperties(event, {
			touches: {
				value: Array.from(touchesOnScreen, (identifier) => ({
					identifier,
				})),
			},
			changedTouches: { value: [{ identifier: id }] },
		});
		target.dispatchEvent(event);
	};

	return {
		node,
		scrollTo,
		disconnect,
		measure: (width: number) => {
			layoutWidth = width;
			resizeCallbacks.get(node)?.([
				{
					contentBoxSize: [{ inlineSize: width, blockSize: 800 }],
				} as unknown as ResizeObserverEntry,
			]);
		},
		relayout: (width: number) => {
			layoutWidth = width;
		},
		scroll: (left: number) => {
			node.scrollLeft = left;
			node.dispatchEvent(new Event("scroll"));
		},
		touch,
	};
}

const attached = new Set<() => void>();

export function detachPagers(): void {
	for (const detach of attached) detach();
	attached.clear();
}

export function harness({
	fingerPhase = null,
	count = 5,
	reducedMotion = false,
	measured = true,
}: {
	fingerPhase?: ScrollGestureState | null;
	count?: number;
	reducedMotion?: boolean;
	measured?: boolean;
} = {}) {
	const node = document.createElement("div");
	const child = document.createElement("div");
	node.append(child);
	document.body.append(node);
	const onRest = vi.fn();
	const onVisible = vi.fn();
	const pager = new SnapPager({
		count: () => count,
		onVisible,
		onRest,
		fingerPhase,
		reducedMotion: () => reducedMotion,
	});
	let cleanup: (() => void) | null = null;
	const attach = () => {
		const detach = pager.attach(node);
		if (typeof detach !== "function") return;
		cleanup = detach;
		attached.add(detach);
	};
	const layout = fakePagerLayout({
		mount: () => {
			attach();
			return node;
		},
		touchTarget: child,
	});

	if (measured) {
		layout.measure(WIDTH);
		onVisible.mockClear();
		onRest.mockClear();
	}

	return {
		...layout,
		pager,
		child,
		onRest,
		onVisible,
		attach,
		detach: () => {
			if (!cleanup) return;
			attached.delete(cleanup);
			cleanup();
			cleanup = null;
		},
		wheel: ({
			deltaX,
			deltaY = 0,
			shiftKey = false,
		}: {
			deltaX: number;
			deltaY?: number;
			shiftKey?: boolean;
		}) =>
			node.dispatchEvent(
				new WheelEvent("wheel", {
					deltaX,
					deltaY,
					shiftKey,
					bubbles: true,
				}),
			),
		pointerDown: () =>
			child.dispatchEvent(new Event("pointerdown", { bubbles: true })),
		focusIn: () =>
			child.dispatchEvent(new FocusEvent("focusin", { bubbles: true })),
	};
}

export function macosGesture() {
	const gesture = new ScrollGestureState();
	return {
		gesture,
		fingers: () => gesture.ingest({ state: "fingers", dx: 0, dy: 0 }),
		released: () => gesture.ingest({ state: "released" }),
		momentum: () => gesture.ingest({ state: "momentum" }),
		idle: () => gesture.ingest({ state: "idle" }),
	};
}
