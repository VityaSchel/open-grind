import { SvelteMap } from "svelte/reactivity";

const AUTOSAVE_INTERVAL_MS = 1_000;

export class Drafts {
	#texts = new SvelteMap<string, string>();
	#editing: { conversationId: string; text: string } | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;

	get(conversationId: string): string {
		return this.#texts.get(conversationId) ?? "";
	}

	save({
		conversationId,
		text,
	}: {
		conversationId: string;
		text: string;
	}): void {
		if (this.#editing?.conversationId === conversationId)
			this.#stopAutosave();
		if (text.trim() === "") this.#texts.delete(conversationId);
		else this.#texts.set(conversationId, text);
	}

	discard(conversationId: string): void {
		this.save({ conversationId, text: "" });
	}

	autosave({
		conversationId,
		text,
	}: {
		conversationId: string;
		text: string;
	}): void {
		const editing = this.#editing;
		if (editing && editing.conversationId !== conversationId)
			this.save(editing);
		this.#editing = { conversationId, text };
		this.#timer ??= setTimeout(
			() => this.#commitEditing(),
			AUTOSAVE_INTERVAL_MS,
		);
	}

	destroy(): void {
		this.#stopAutosave();
		this.#texts.clear();
	}

	#commitEditing(): void {
		const editing = this.#editing;
		this.#stopAutosave();
		if (editing) this.save(editing);
	}

	#stopAutosave(): void {
		this.#editing = null;
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
	}
}
