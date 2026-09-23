import type { Attachment } from "svelte/attachments";

export type PaneSnapshot = {
	node: HTMLElement;
	path: string;
	restore: () => void;
};

const FORM_FIELDS = "input, textarea, select";
const OFFSCREEN_SKIPPED = "[data-offscreen-skip]";
const IDENTITY_ATTRIBUTES = ["id", "data-slot"];

const scrolledIn = new WeakMap<HTMLElement, Set<Element>>();

export const trackScrolled: Attachment<HTMLElement> = (pane) => {
	const scrolled = new Set<Element>();
	scrolledIn.set(pane, scrolled);
	const remember = ({ target }: Event) => {
		if (target instanceof Element) scrolled.add(target);
	};
	pane.addEventListener("scroll", remember, { capture: true, passive: true });
	return () => {
		pane.removeEventListener("scroll", remember, { capture: true });
		scrolledIn.delete(pane);
	};
};

function childPath({
	root,
	element,
}: {
	root: Element;
	element: Element;
}): number[] {
	const path: number[] = [];
	let node = element;
	while (node !== root && node.parentElement) {
		path.unshift([...node.parentElement.children].indexOf(node));
		node = node.parentElement;
	}
	return path;
}

function follow({
	root,
	path,
}: {
	root: Element;
	path: number[];
}): Element | undefined {
	return path.reduce<Element | undefined>(
		(node, index) => node?.children[index],
		root,
	);
}

function scrollCarriers({
	pane,
	clone,
}: {
	pane: HTMLElement;
	clone: HTMLElement;
}) {
	const scrolled = scrolledIn.get(pane);
	if (!scrolled) return [];
	return [...scrolled].flatMap((source) => {
		if (!pane.contains(source)) {
			scrolled.delete(source);
			return [];
		}
		const copy = follow({
			root: clone,
			path: childPath({ root: pane, element: source }),
		});
		if (!copy) return [];
		const { scrollTop, scrollLeft } = source;
		return [
			() => {
				copy.scrollTop = scrollTop;
				copy.scrollLeft = scrollLeft;
			},
		];
	});
}

function sizePins({ pane, clone }: { pane: HTMLElement; clone: HTMLElement }) {
	const copies = clone.querySelectorAll<HTMLElement>(OFFSCREEN_SKIPPED);
	return [...pane.querySelectorAll<HTMLElement>(OFFSCREEN_SKIPPED)].flatMap(
		(source, index) => {
			const copy = copies[index];
			if (!copy) return [];
			const height = `${source.offsetHeight}px`;
			return [
				() => {
					copy.style.containIntrinsicBlockSize = height;
				},
			];
		},
	);
}

function formValue(field: Element) {
	if (field instanceof HTMLInputElement)
		return { value: field.value, checked: field.checked };
	if (field instanceof HTMLTextAreaElement) return { value: field.value };
	if (field instanceof HTMLSelectElement)
		return { selectedIndex: field.selectedIndex };
	return {};
}

function formCarriers({
	pane,
	clone,
}: {
	pane: HTMLElement;
	clone: HTMLElement;
}) {
	const copies = clone.querySelectorAll(FORM_FIELDS);
	return [...pane.querySelectorAll(FORM_FIELDS)].flatMap((field, index) => {
		const copy = copies[index];
		if (!copy) return [];
		const value = formValue(field);
		return [() => Object.assign(copy, value)];
	});
}

export function snapshotPane(pane: HTMLElement, path: string): PaneSnapshot {
	const clone = pane.cloneNode(true) as HTMLElement;
	clone.inert = true;
	clone.setAttribute("aria-hidden", "true");
	for (const attribute of IDENTITY_ATTRIBUTES) {
		clone.removeAttribute(attribute);
		for (const element of clone.querySelectorAll(`[${attribute}]`))
			element.removeAttribute(attribute);
	}
	clone.dataset.slot = "page-stack-ghost";

	const carried = [
		...sizePins({ pane, clone }),
		...scrollCarriers({ pane, clone }),
		...formCarriers({ pane, clone }),
	];
	return {
		node: clone,
		path,
		restore: () => carried.forEach((apply) => apply()),
	};
}
