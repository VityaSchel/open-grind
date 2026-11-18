import type { Attachment } from "svelte/attachments";

export type Snapshot = {
	node: HTMLElement;
	path: string;
	restore: () => void;
	showsNavBar?: boolean;
};

type SnapshotMode = {
	slot: string;
	stripped: readonly string[];
	stillMedia: boolean;
	inheritsVisibility: boolean;
};

const PANE_MODE: SnapshotMode = {
	slot: "page-stack-ghost",
	stripped: ["id", "data-slot"],
	stillMedia: false,
	inheritsVisibility: false,
};

const SCREEN_MODE: SnapshotMode = {
	slot: "screen-ghost",
	stripped: ["id", "data-fixed-header"],
	stillMedia: true,
	inheritsVisibility: true,
};

const FORM_FIELDS = "input, textarea, select";
const OFFSCREEN_SKIPPED = "[data-offscreen-skip]";
const TRANSIENT_LAYERS = [
	"page-stack-ghost",
	"page-stack-dim",
	"live-stack-dim",
];
const STACK_PANES = ["page-stack-pane", "live-stack-base", "live-stack-sheet"];
const NAV_BAR = '[data-slot="navbar"]';
const OUT_OF_SIGHT = "[inert], [data-covered]";
const STILL_VIDEO_ATTRIBUTES = ["src", "autoplay"];
const BLOCK_EDGES = [
	"paddingTop",
	"paddingBottom",
	"borderTopWidth",
	"borderBottomWidth",
] as const;

const scrolledIn = new WeakMap<HTMLElement, Set<Element>>();

export const trackScrolled: Attachment<HTMLElement> = (pane) => {
	const scrolled = new Set<Element>();
	scrolledIn.set(pane, scrolled);
	const remember = ({ target }: Event) => {
		if (!(target instanceof Element) || scrolled.has(target)) return;
		for (const element of scrolled)
			if (!pane.contains(element)) scrolled.delete(element);
		scrolled.add(target);
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

function contentBlockSize(element: HTMLElement): number {
	const style = getComputedStyle(element);
	return BLOCK_EDGES.reduce(
		(size, edge) => size - parseFloat(style[edge]),
		element.getBoundingClientRect().height,
	);
}

function sizePins({ pane, clone }: { pane: HTMLElement; clone: HTMLElement }) {
	const copies = clone.querySelectorAll<HTMLElement>(OFFSCREEN_SKIPPED);
	return [...pane.querySelectorAll<HTMLElement>(OFFSCREEN_SKIPPED)].flatMap(
		(source, index) => {
			const copy = copies[index];
			if (!copy) return [];
			const height = `${contentBlockSize(source)}px`;
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

function slotSelector(slots: string[]): string {
	return slots.map((slot) => `[data-slot="${slot}"]`).join(", ");
}

function selfAndDescendants({
	root,
	selector,
}: {
	root: HTMLElement;
	selector: string;
}): HTMLElement[] {
	const descendants = [...root.querySelectorAll<HTMLElement>(selector)];
	return root.matches(selector) ? [root, ...descendants] : descendants;
}

function sanitize(clone: HTMLElement): void {
	for (const layer of clone.querySelectorAll(slotSelector(TRANSIENT_LAYERS)))
		layer.remove();
	for (const pane of selfAndDescendants({
		root: clone,
		selector: slotSelector(STACK_PANES),
	})) {
		pane.style.removeProperty("transform");
		pane.style.removeProperty("opacity");
		pane.removeAttribute("data-slot");
	}
}

function stripAttributes({
	clone,
	stripped,
}: {
	clone: HTMLElement;
	stripped: readonly string[];
}): void {
	for (const attribute of stripped) {
		clone.removeAttribute(attribute);
		for (const element of clone.querySelectorAll(`[${attribute}]`))
			element.removeAttribute(attribute);
	}
}

function stillVideos(clone: HTMLElement): void {
	for (const video of clone.querySelectorAll("video")) {
		video.autoplay = false;
		for (const attribute of STILL_VIDEO_ATTRIBUTES)
			video.removeAttribute(attribute);
	}
}

function inheritVisibility(clone: HTMLElement): void {
	for (const element of clone.querySelectorAll<HTMLElement>(
		'[style*="visibility"]',
	))
		if (element.style.visibility === "visible")
			element.style.removeProperty("visibility");
}

function snapshot({
	root,
	path,
	mode,
}: {
	root: HTMLElement;
	path: string;
	mode: SnapshotMode;
}): Snapshot {
	const clone = root.cloneNode(true) as HTMLElement;
	const carried = [
		...sizePins({ pane: root, clone }),
		...scrollCarriers({ pane: root, clone }),
		...formCarriers({ pane: root, clone }),
	];

	sanitize(clone);
	stripAttributes({ clone, stripped: mode.stripped });
	if (mode.stillMedia) stillVideos(clone);
	if (mode.inheritsVisibility) inheritVisibility(clone);
	clone.inert = true;
	clone.setAttribute("aria-hidden", "true");
	clone.dataset.slot = mode.slot;

	return {
		node: clone,
		path,
		restore: () => carried.forEach((apply) => apply()),
	};
}

export function snapshotPane({
	pane,
	path,
}: {
	pane: HTMLElement;
	path: string;
}): Snapshot {
	return snapshot({ root: pane, path, mode: PANE_MODE });
}

function showsNavBar(root: HTMLElement): boolean {
	const navBars = [...root.querySelectorAll<HTMLElement>(NAV_BAR)];
	return (
		navBars.length === 0 ||
		navBars.some(
			(navBar) => !navBar.hidden && navBar.closest(OUT_OF_SIGHT) === null,
		)
	);
}

export function snapshotScreen({
	root,
	path,
}: {
	root: HTMLElement;
	path: string;
}): Snapshot {
	return {
		...snapshot({ root, path, mode: SCREEN_MODE }),
		showsNavBar: showsNavBar(root),
	};
}
