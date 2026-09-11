import { vi } from "vitest";

import { ScrollGestureState } from "$lib/platform/scroll-gesture";
import { MAX_DRAG_PX, SwipeToReply } from "$lib/util/swipe-to-reply.svelte";

export const TRIGGER_DISTANCE_PX = 64;
export const RAIL_WHEEL_CHAIN_MS = 300;
export const RAIL_RELEASE_FALLBACK_MS = 250;

export function pointer(overrides: Partial<PointerEvent> = {}) {
	return {
		pointerId: 1,
		pointerType: "touch",
		clientX: 0,
		clientY: 0,
		currentTarget: { setPointerCapture: vi.fn() },
		...overrides,
	} as unknown as PointerEvent;
}

export function swipeToReply() {
	const onReply = vi.fn();
	const onArm = vi.fn();
	const swipe = new SwipeToReply({ direction: "right", onReply, onArm });
	return { swipe, onReply, onArm };
}

export function drag(
	swipe: SwipeToReply,
	{ x, y = 0 }: { x: number; y?: number },
): void {
	swipe.handlers.onpointerdown?.(pointer() as never);
	swipe.handlers.onpointermove?.(
		pointer({ clientX: x, clientY: y }) as never,
	);
}

export function railHarness({
	direction = "right",
	scrollEndSupported = true,
}: { direction?: "left" | "right"; scrollEndSupported?: boolean } = {}) {
	const onReply = vi.fn();
	const onArm = vi.fn();
	let time = 0;
	const swipe = new SwipeToReply({
		direction,
		onReply,
		onArm,
		now: () => time,
		scrollEndSupported,
	});
	const rail = document.createElement("div");
	const rest = direction === "right" ? MAX_DRAG_PX : 0;
	const cleanup = swipe.attachRail(rail);
	return {
		swipe,
		onReply,
		onArm,
		rail,
		rest,
		detach: () => {
			if (typeof cleanup === "function") cleanup();
		},
		advance: (ms: number) => {
			time += ms;
		},
		// Fingers stream small wheel deltas while the row's scroller follows;
		// the wheel's delta points the way the content scrolls, which is
		// scrollLeft's own direction. The deltas alternate fat and thin the
		// way real fingers jitter, so a swipe never reads as a momentum tail.
		swipeBy(px: number, { steps = 6, deltaY = 0, stepMs = 16 } = {}) {
			const sign = direction === "right" ? 1 : -1;
			const target = Math.max(
				0,
				Math.min(MAX_DRAG_PX, rest - (this.dragPx() + px) * sign),
			);
			let remaining = target - rail.scrollLeft;
			for (let step = 0; step < steps; step++) {
				const even = (remaining / (steps - step)) * 1.25;
				const delta =
					step === steps - 1
						? remaining
						: even * (step % 2 === 0 ? 1 : 0.6);
				this.advance(stepMs);
				rail.dispatchEvent(
					new WheelEvent("wheel", {
						deltaX: delta,
						deltaY: deltaY / steps,
						deltaMode: 0,
						cancelable: true,
					}),
				);
				rail.scrollLeft += delta;
				remaining -= delta;
				rail.dispatchEvent(new Event("scroll"));
			}
		},
		// a flick's tail: fingers already gone, magnitudes only ever decaying
		momentumTail({ events = 8, startPx = 40 } = {}) {
			const sign = direction === "right" ? -1 : 1;
			for (let index = 0; index < events; index++) {
				this.advance(16);
				rail.dispatchEvent(
					new WheelEvent("wheel", {
						deltaX: startPx * 0.8 ** index * sign,
						deltaY: 0,
						deltaMode: 0,
						cancelable: true,
					}),
				);
			}
		},
		dragPx() {
			const sign = direction === "right" ? 1 : -1;
			return (rest - rail.scrollLeft) * sign;
		},
		lift() {
			rail.dispatchEvent(new Event("scrollend"));
		},
	};
}

export function bridgeHarness({
	direction = "right",
}: { direction?: "left" | "right" } = {}) {
	const onReply = vi.fn();
	const onArm = vi.fn();
	const gesture = new ScrollGestureState();
	const swipe = new SwipeToReply({
		direction,
		onReply,
		onArm,
		wheelMode: "bridge",
		gesture,
	});
	const node = document.createElement("div");
	const cleanup = swipe.attachRail(node);
	const dragSign = direction === "right" ? 1 : -1;
	return {
		swipe,
		onReply,
		onArm,
		gesture,
		detach: () => {
			if (typeof cleanup === "function") cleanup();
		},
		fingers: () => gesture.ingest({ state: "fingers", dx: 0, dy: 0 }),
		release: () => gesture.ingest({ state: "released" }),
		momentum: () => gesture.ingest({ state: "momentum" }),
		// DOM wheels decide the axis; the bridge's scrollingDeltas move the
		// row. domScale models WKWebView's hotter DOM deltas.
		wheel(
			towardPx: number,
			crossPx = 0,
			{ events = 6, domScale = 1 } = {},
		) {
			const cancelled: boolean[] = [];
			for (let index = 0; index < events; index++) {
				const event = new WheelEvent("wheel", {
					deltaX: ((-towardPx * dragSign) / events) * domScale,
					deltaY: (crossPx / events) * domScale,
					deltaMode: 0,
					cancelable: true,
				});
				node.dispatchEvent(event);
				cancelled.push(event.defaultPrevented);
				gesture.ingest({
					dx: (towardPx * dragSign) / events,
					dy: crossPx / events,
				});
			}
			return { cancelled };
		},
	};
}
