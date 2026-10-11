import { showErrorToast } from "$lib/api/error-toast";
import { markConversationAsRead } from "$lib/api/messaging/conversations";
import type { Conversation } from "$lib/model/messaging/conversations";

type Restore = () => void;

export class ConversationReadRequests {
	readonly #waiting = new Map<string, Restore[]>();
	readonly #sending = new Set<string>();
	readonly #snapshots = new Map<string, number>();
	readonly #unlistedUnread = new Set<string>();

	noteSnapshot(conversationId: string): void {
		this.#snapshots.set(
			conversationId,
			(this.#snapshots.get(conversationId) ?? 0) + 1,
		);
	}

	read(entry: Conversation): Promise<void> {
		const { conversationId } = entry.data;
		const cleared = entry.data.unreadCount;
		if (cleared === 0) return Promise.resolve();
		entry.data.unreadCount = 0;
		const snapshot = this.#snapshots.get(conversationId);
		return this.#queue(conversationId, () => {
			if (this.#snapshots.get(conversationId) === snapshot)
				entry.data.unreadCount += cleared;
		});
	}

	noteUnlistedUnread(conversationId: string): void {
		this.#unlistedUnread.add(conversationId);
	}

	readUnlisted(conversationId: string): Promise<void> {
		if (!this.#unlistedUnread.delete(conversationId))
			return Promise.resolve();
		return this.#queue(conversationId, () =>
			this.#unlistedUnread.add(conversationId),
		);
	}

	#queue(conversationId: string, restore: Restore): Promise<void> {
		const waiting = this.#waiting.get(conversationId) ?? [];
		waiting.push(restore);
		this.#waiting.set(conversationId, waiting);
		if (this.#sending.has(conversationId)) return Promise.resolve();
		return this.#send(conversationId);
	}

	async #send(conversationId: string): Promise<void> {
		this.#sending.add(conversationId);
		try {
			for (
				let batch = this.#take(conversationId);
				batch.length > 0;
				batch = this.#take(conversationId)
			) {
				try {
					await markConversationAsRead({ conversationId });
				} catch (error) {
					console.error(error);
					showErrorToast({
						label: "Failed to mark conversation as read",
						error,
					});
					for (const restore of [
						...batch,
						...this.#take(conversationId),
					])
						restore();
					return;
				}
			}
		} finally {
			this.#sending.delete(conversationId);
		}
	}

	#take(conversationId: string): Restore[] {
		const batch = this.#waiting.get(conversationId) ?? [];
		this.#waiting.delete(conversationId);
		return batch;
	}
}
