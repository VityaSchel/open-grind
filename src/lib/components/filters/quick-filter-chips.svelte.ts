import { createContext, untrack } from "svelte";
import type { Attachment } from "svelte/attachments";

import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";

type Chip = { key: string; node: HTMLElement };

function inDocumentOrder(a: Chip, b: Chip): number {
	return a.node.compareDocumentPosition(b.node) &
		Node.DOCUMENT_POSITION_FOLLOWING
		? -1
		: 1;
}

export class QuickFilterChips {
	#chips: readonly Chip[] = $state.raw([]);
	readonly #keys = $derived(
		this.#chips.toSorted(inDocumentOrder).map(({ key }) => key),
	);
	readonly #toolbar = new RovingFocusState({
		keys: () => this.#keys,
		orientation: "horizontal",
		wrap: "loop",
	});

	readonly container: Attachment<HTMLElement> = this.#toolbar.container;

	chip(key: string): Attachment<HTMLElement> {
		return (node) =>
			untrack(() => {
				this.#chips = [...this.#chips, { key, node }];
				const unregister = this.#toolbar.item(key)(node);
				return () => {
					this.#chips = this.#chips.filter(
						(chip) => chip.node !== node,
					);
					unregister?.();
				};
			});
	}
}

export const [quickFilterChips, setQuickFilterChips, insideQuickFilterBar] =
	createContext<QuickFilterChips>();
