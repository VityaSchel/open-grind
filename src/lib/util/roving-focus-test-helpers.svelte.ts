import { flushSync, tick } from "svelte";
import { SvelteMap } from "svelte/reactivity";

import {
	type RovingFocusOptions,
	RovingFocusState,
	type RovingKey,
} from "./roving-focus-state.svelte";

type Build = (key: RovingKey) => HTMLElement;

const roots: (() => void)[] = [];

export function destroyRovingLists(): void {
	for (const destroy of roots.splice(0)) destroy();
}

export function button(label: string): HTMLButtonElement {
	const element = document.createElement("button");
	element.type = "button";
	element.textContent = label;
	return element;
}

export function row(labels: string[]): HTMLElement {
	const element = document.createElement("div");
	element.dataset.slot = "row";
	element.append(...labels.map(button));
	return element;
}

export function rowCells(item: HTMLElement): HTMLElement[] {
	return [...item.querySelectorAll("button")];
}

export async function settle(): Promise<void> {
	flushSync();
	await Promise.resolve();
	await tick();
}

export function rovingList({
	keys,
	mounted = keys,
	build = (key) => button(String(key)),
	parent = document.body,
	container = document.createElement("div"),
	...options
}: Partial<Omit<RovingFocusOptions, "keys">> & {
	keys: RovingKey[];
	mounted?: RovingKey[];
	build?: Build;
	parent?: HTMLElement;
	container?: HTMLElement;
}) {
	parent.append(container);
	const list = $state({ keys });
	const state = new RovingFocusState({
		keys: () => list.keys,
		orientation: "vertical",
		...options,
	});
	const destroy = $effect.root(() => state.container(container));
	roots.push(destroy);
	const nodes = new SvelteMap<RovingKey, HTMLElement>();
	const teardowns = new SvelteMap<RovingKey, () => void>();
	const mount = (key: RovingKey) => {
		const node = build(key);
		const after = list.keys
			.slice(list.keys.indexOf(key) + 1)
			.map((later) => nodes.get(later))
			.find((later) => later !== undefined);
		container.insertBefore(node, after ?? null);
		nodes.set(key, node);
		teardowns.set(key, state.item(key)(node) as () => void);
	};
	const unmount = (key: RovingKey) => {
		nodes.get(key)?.remove();
		nodes.delete(key);
		teardowns.get(key)?.();
		teardowns.delete(key);
	};
	for (const key of mounted) mount(key);
	return {
		state,
		container,
		list,
		nodes,
		mount,
		unmount,
		node: (key: RovingKey) => nodes.get(key)!,
		detach: () => {
			roots.splice(roots.indexOf(destroy), 1);
			destroy();
			container.remove();
		},
	};
}

export function press(
	target: Element,
	key: string,
	init: KeyboardEventInit = {},
): KeyboardEvent {
	const event = new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		cancelable: true,
		...init,
	});
	target.dispatchEvent(event);
	return event;
}

export function tabStops(container: HTMLElement): Element[] {
	return [...container.querySelectorAll('[tabindex="0"]')];
}

export function outsideButton(): HTMLButtonElement {
	const outside = button("outside");
	document.body.append(outside);
	return outside;
}
