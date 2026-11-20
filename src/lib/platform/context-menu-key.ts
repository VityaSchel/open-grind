import { allowsNativeMenu } from "#lib/platform/block-native-menu.ts";
import { currentPlatform } from "#lib/platform/os.ts";

type KeyPhase = "keydown" | "keyup";

const menuKeyOpensOn: Record<ReturnType<typeof currentPlatform>, KeyPhase> = {
	macos: "keydown",
	ios: "keydown",
	windows: "keyup",
	linux: "keydown",
	android: "keydown",
};

function openingPhase({
	event,
	menuKeyPhase,
}: {
	event: KeyboardEvent;
	menuKeyPhase: KeyPhase;
}): KeyPhase | null {
	const { key, shiftKey, ctrlKey, altKey, metaKey } = event;
	if (ctrlKey || altKey || metaKey) return null;
	if (key === "F10") return shiftKey ? "keydown" : null;
	if (key === "ContextMenu") return shiftKey ? null : menuKeyPhase;
	return null;
}

export function dispatchContextMenu(target: Element): void {
	const { left, top, right, bottom } = target.getBoundingClientRect();
	target.dispatchEvent(
		new PointerEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
			composed: true,
			pointerType: "",
			button: 2,
			clientX:
				(Math.max(left, 0) + Math.min(right, window.innerWidth)) / 2,
			clientY:
				(Math.max(top, 0) + Math.min(bottom, window.innerHeight)) / 2,
		}),
	);
}

export function bindContextMenuKey(): () => void {
	const menuKeyPhase = menuKeyOpensOn[currentPlatform()];
	const onKey = (event: KeyboardEvent) => {
		const opensOn = openingPhase({ event, menuKeyPhase });
		if (opensOn === null || event.defaultPrevented) return;
		const focused = document.activeElement;
		if (focused === null || focused === document.body) return;
		const selection = window.getSelection();
		if (allowsNativeMenu({ target: focused, selection })) return;
		event.preventDefault();
		if (event.type === opensOn && !event.repeat)
			dispatchContextMenu(focused);
	};
	const listening = new AbortController();
	window.addEventListener("keydown", onKey, { signal: listening.signal });
	window.addEventListener("keyup", onKey, { signal: listening.signal });
	return () => listening.abort();
}
