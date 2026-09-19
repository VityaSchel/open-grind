export type PaneSnapshot = {
	node: HTMLElement;
	path: string;
	restore: () => void;
};

function liveFormState(element: Element) {
	if (element instanceof HTMLInputElement)
		return { value: element.value, checked: element.checked };
	if (element instanceof HTMLTextAreaElement) return { value: element.value };
	if (element instanceof HTMLSelectElement)
		return { selectedIndex: element.selectedIndex };
	return null;
}

function carryLiveState(source: Element, copy: Element): () => void {
	const { scrollTop, scrollLeft } = source;
	const form = liveFormState(source);
	return () => {
		copy.scrollTop = scrollTop;
		copy.scrollLeft = scrollLeft;
		if (form) Object.assign(copy, form);
	};
}

const IDENTITY_ATTRIBUTES = ["id", "data-slot"];

export function snapshotPane(pane: HTMLElement, path: string): PaneSnapshot {
	const node = pane.cloneNode(true) as HTMLElement;
	node.inert = true;
	node.setAttribute("aria-hidden", "true");
	for (const attribute of IDENTITY_ATTRIBUTES) {
		node.removeAttribute(attribute);
		for (const element of node.querySelectorAll(`[${attribute}]`))
			element.removeAttribute(attribute);
	}

	const copies = node.querySelectorAll("*");
	const carried: Array<() => void> = [];
	pane.querySelectorAll("*").forEach((source, index) => {
		const copy = copies[index];
		if (copy) carried.push(carryLiveState(source, copy));
	});

	return { node, path, restore: () => carried.forEach((apply) => apply()) };
}
