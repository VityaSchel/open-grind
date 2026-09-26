import type { TouchOriginHints } from "$lib/platform/touch-origin";

export function contextMenuEvent(origin: TouchOriginHints = {}): MouseEvent {
	return Object.assign(
		new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
		origin,
	);
}
