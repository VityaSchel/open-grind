import { SvelteMap } from "svelte/reactivity";

const AUTOSAVE_INTERVAL_MS = 1_000;

export class Drafts {
	#texts = new SvelteMap<string, string>();
	// Kept apart from the text: save() deletes a draft whose text is empty, and
	// the composer's unmount cleanup calls exactly that.
	#replyTargets = new SvelteMap<string, string>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- gates writes from open composers, never read from a template or $derived
	#forgotten = new Set<string>();
	#editing: { conversationId: string; text: string } | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#destroyed = false;

	get(conversationId: string): string {
		return this.#texts.get(conversationId) ?? "";
	}

	open(conversationId: string): string {
		this.#forgotten.delete(conversationId);
		return this.get(conversationId);
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
		if (this.#destroyed || this.#forgotten.has(conversationId)) return;
		if (text.trim() === "") this.#texts.delete(conversationId);
		else this.#texts.set(conversationId, text);
	}

	discard(conversationId: string): void {
		this.save({ conversationId, text: "" });
		this.clearReplyTo(conversationId);
	}

	forget(conversationId: string): void {
		if (this.#editing?.conversationId === conversationId)
			this.#stopAutosave();
		this.#forgotten.add(conversationId);
		this.#texts.delete(conversationId);
		this.#replyTargets.delete(conversationId);
	}

	replyTo(conversationId: string): string | null {
		return this.#replyTargets.get(conversationId) ?? null;
	}

	setReplyTo({
		conversationId,
		messageId,
	}: {
		conversationId: string;
		messageId: string;
	}): void {
		if (this.#destroyed || this.#forgotten.has(conversationId)) return;
		this.#replyTargets.set(conversationId, messageId);
	}

	clearReplyTo(conversationId: string): void {
		this.#replyTargets.delete(conversationId);
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
		if (this.#destroyed || this.#forgotten.has(conversationId)) return;
		this.#editing = { conversationId, text };
		this.#timer ??= setTimeout(
			() => this.#commitEditing(),
			AUTOSAVE_INTERVAL_MS,
		);
	}

	destroy(): void {
		this.#destroyed = true;
		this.#stopAutosave();
		this.#texts.clear();
		this.#replyTargets.clear();
		this.#forgotten.clear();
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
