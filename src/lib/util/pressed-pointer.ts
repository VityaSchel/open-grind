export function stopOtherPointerOutWhilePressed(node: HTMLElement): () => void {
	const pressed = new Set<number>();
	const press = (event: PointerEvent) => {
		pressed.add(event.pointerId);
	};
	const lift = (event: PointerEvent) => {
		pressed.delete(event.pointerId);
	};
	const stopOtherPointerOut = (event: PointerEvent) => {
		if (pressed.size > 0 && !pressed.has(event.pointerId))
			event.stopImmediatePropagation();
	};
	node.addEventListener("pointerdown", press, true);
	node.addEventListener("pointerout", stopOtherPointerOut, true);
	window.addEventListener("pointerup", lift, true);
	window.addEventListener("pointercancel", lift, true);
	return () => {
		node.removeEventListener("pointerdown", press, true);
		node.removeEventListener("pointerout", stopOtherPointerOut, true);
		window.removeEventListener("pointerup", lift, true);
		window.removeEventListener("pointercancel", lift, true);
	};
}
