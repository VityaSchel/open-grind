import { vi } from "vitest";

import { PullModel } from "./pull-model.svelte";

const SPACE = 48;
export const ARMING_PX = 60;
export const NON_ARMING_PX = 20;

export function makeModel() {
	const model = new PullModel({ now: () => 0 });
	model.space = SPACE;
	const onTrigger = vi.fn();
	model.onTrigger = onTrigger;
	return { model, onTrigger };
}

export function makeScrollable(
	el: HTMLElement,
	{ scrollHeight = 500, clientHeight = 100, scrollTop = 0 } = {},
) {
	el.style.overflowY = "auto";
	Object.defineProperties(el, {
		scrollHeight: { value: scrollHeight, configurable: true },
		clientHeight: { value: clientHeight, configurable: true },
	});
	el.scrollTop = scrollTop;
}

export function touchEvent(
	type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
	{ id = 0, x = 0, y = 0 } = {},
) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	const touch = { identifier: id, clientX: x, clientY: y };
	const active = type === "touchstart" || type === "touchmove" ? [touch] : [];
	Object.defineProperties(event, {
		touches: { value: active },
		changedTouches: { value: [touch] },
	});
	return event as unknown as TouchEvent;
}
