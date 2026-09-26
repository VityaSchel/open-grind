import { fireEvent } from "@testing-library/svelte";

import type { TouchOriginHints } from "$lib/platform/touch-origin";

export function contextMenuEvent(origin: TouchOriginHints = {}): MouseEvent {
	return Object.assign(
		new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
			button: 2,
		}),
		origin,
	);
}

export async function rightClick(element: Element): Promise<void> {
	await fireEvent(element, contextMenuEvent({ pointerType: "mouse" }));
}
