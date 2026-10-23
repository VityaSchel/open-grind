import { playHaptic } from "$lib/haptics";
import { firedByTouch } from "$lib/platform/touch-origin";

const TEXT_INPUT_TYPES = new Set([
	"email",
	"number",
	"password",
	"search",
	"tel",
	"text",
	"url",
]);

type Point = { x: number; y: number };

function elementOf(node: Node): Element | null {
	return node instanceof Element ? node : node.parentElement;
}

function caretRangeAt({ x, y }: Point): Range | null {
	if (typeof document.caretRangeFromPoint !== "function") return null;
	return document.caretRangeFromPoint(x, y);
}

function isOnSelectedText({
	range,
	point,
}: {
	range: Range;
	point: Point;
}): boolean {
	const caret = caretRangeAt(point);
	return (
		caret !== null &&
		range.isPointInRange(caret.startContainer, caret.startOffset)
	);
}

function isTextEditable(element: Element): boolean {
	if (element instanceof HTMLTextAreaElement) return true;
	if (element instanceof HTMLInputElement) {
		return TEXT_INPUT_TYPES.has(element.type);
	}
	const editingHost = element.closest("[contenteditable]");
	return (
		editingHost !== null &&
		editingHost.getAttribute("contenteditable") !== "false"
	);
}

function selectionTouches({
	selection,
	node,
	point,
}: {
	selection: Selection;
	node: Node;
	point?: Point;
}): boolean {
	if (selection.isCollapsed) return false;
	for (let index = 0; index < selection.rangeCount; index++) {
		const range = selection.getRangeAt(index);
		if (!range.intersectsNode(node)) continue;
		const selectedElement = elementOf(range.commonAncestorContainer);
		if (node === selectedElement || !node.contains(selectedElement)) {
			return true;
		}
		if (point !== undefined && isOnSelectedText({ range, point })) {
			return true;
		}
	}
	return false;
}

export function allowsNativeMenu({
	target,
	selection,
	point,
}: {
	target: EventTarget | null;
	selection: Selection | null;
	point?: Point;
}): boolean {
	if (!(target instanceof Node)) return false;
	const element = elementOf(target);
	if (element !== null && isTextEditable(element)) return true;
	return (
		selection !== null &&
		selectionTouches({ selection, node: target, point })
	);
}

export function blockNativeMenu(): () => void {
	const onContextMenu = (event: MouseEvent) => {
		if (event.defaultPrevented) return;
		const selection = window.getSelection();
		const point = { x: event.clientX, y: event.clientY };
		if (allowsNativeMenu({ target: event.target, selection, point })) {
			if (firedByTouch(event)) playHaptic("longPress");
			return;
		}
		event.preventDefault();
	};
	window.addEventListener("contextmenu", onContextMenu);
	return () => {
		window.removeEventListener("contextmenu", onContextMenu);
	};
}
