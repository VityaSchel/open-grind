import { createContext } from "svelte";

import type { ConversationState } from "../conversation-state.svelte";
import type { MessageComposerContext } from "./message-composer-context.svelte";

export type ComposerSheet = "attachments" | "stickers";

export type ComposerBinding = {
	conversationState: () => ConversationState;
	context: MessageComposerContext;
	focusTrigger: (options: { sheet: ComposerSheet }) => void;
};

export class ComposerSheetsState {
	#open = $state.raw<{ conversationId: string; sheet: ComposerSheet } | null>(
		null,
	);
	#composer = $state.raw<ComposerBinding | null>(null);
	// Teardowns read $state as it was before this flush's writes, so an unbind
	// running right after a newer bind would still see itself in #composer.
	#latestBinding: ComposerBinding | null = null;
	#focusedAtOpen: Element | null = null;

	get composer(): ComposerBinding | null {
		return this.#composer;
	}

	isOpen({
		conversationId,
		sheet,
	}: {
		conversationId: string;
		sheet: ComposerSheet;
	}): boolean {
		return (
			this.#open?.conversationId === conversationId &&
			this.#open.sheet === sheet
		);
	}

	hasOpenSheet({ conversationId }: { conversationId: string }): boolean {
		return this.#open?.conversationId === conversationId;
	}

	setOpen({
		conversationId,
		sheet,
		open,
	}: {
		conversationId: string;
		sheet: ComposerSheet;
		open: boolean;
	}): void {
		if (open) {
			this.#focusedAtOpen = document.activeElement;
			this.#open = { conversationId, sheet };
		} else if (this.isOpen({ conversationId, sheet })) this.#open = null;
	}

	returnFocusOnClose({
		sheet,
		event,
	}: {
		sheet: ComposerSheet;
		event: Event;
	}): void {
		const focusedAtOpen = this.#focusedAtOpen;
		this.#focusedAtOpen = null;
		if (focusedAtOpen === null || focusedAtOpen.isConnected) return;
		event.preventDefault();
		this.#latestBinding?.focusTrigger({ sheet });
	}

	close({ conversationId }: { conversationId: string }): void {
		if (this.hasOpenSheet({ conversationId })) this.#open = null;
	}

	bind(binding: ComposerBinding): () => void {
		this.#latestBinding = binding;
		this.#composer = binding;
		return () => {
			if (this.#latestBinding !== binding) return;
			this.#latestBinding = null;
			this.#composer = null;
		};
	}
}

export const [getComposerSheets, setComposerSheets] =
	createContext<ComposerSheetsState>();
