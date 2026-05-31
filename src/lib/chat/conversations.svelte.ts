import { toast } from "svelte-sonner";
import z from "zod";

import {
	getConversations,
	markConversationAsRead,
} from "$lib/api/conversation";
import { previewFromMessage } from "$lib/model/message";
import {
	chatV1ConversationDeleteEventSchema,
	chatV1MessageSentEventSchema,
	ws,
} from "$lib/ws.svelte";
import type { Conversation } from "$lib/model/conversation";
import type { ApiResponseMessage } from "$lib/model/message";

export type CachedConversation = {
	messages: ApiResponseMessage[];
	profile: {
		distance: number | null;
		mediaHash: string | null;
		name: string | null;
		onlineUntil: number | null;
		profileId: number;
		showDistance: boolean;
	};
	pageKey: string | null;
	cachedAt: number;
	lastReadTimestamp: number | null;
};

class ConversationsState {
	entries = $state<Conversation[]>([]);
	nextPage = $state<number | null>(null);
	loadingMore = $state(false);
	inboxLastViewedAt = $state(0);
	initial: Promise<void>;
	listScrollY = 0;

	readonly ourProfileId: number;
	#activeConversationId: string | null = null;
	#wsPromises: Promise<() => void>[] = [];
	#messageCache = new Map<string, CachedConversation>();
	#firstConnect = true;
	#wasHidden = false;
	#lastReconcileAt = 0;
	#reconcileListeners = new Set<() => void | Promise<void>>();
	#removeVisibility: (() => void) | null = null;
	#destroyed = false;

	constructor(ourProfileId: number) {
		this.ourProfileId = ourProfileId;
		this.inboxLastViewedAt = this.#loadInboxLastViewed();
		this.initial = this.#load(1);

		this.#wsPromises.push(
			ws.onConnected(() => {
				if (this.#destroyed) return;
				if (this.#firstConnect) {
					this.#firstConnect = false;
					return;
				}
				void this.#reconcile();
			}),
			ws.on("chat.v1.message_sent", chatV1MessageSentEventSchema, (event) => {
				if (this.#destroyed) return;
				const message = event.payload;
				const entry = this.entries.find(
					(entry) => entry.data.conversationId === message.conversationId,
				);
				if (entry) {
					const isActive =
						message.conversationId === this.#activeConversationId;
					if (!isActive && message.senderId !== this.ourProfileId) {
						entry.data.unreadCount += 1;
					}
					if (!isActive) {
						this.invalidateConversation(message.conversationId);
					}
					this.updatePreview({
						conversationId: message.conversationId,
						preview: previewFromMessage(message),
						timestamp: message.timestamp,
					});
				} else {
					void this.ensureLoaded(message.conversationId);
				}
			}),
			ws.on(
				"chat.v1.conversation.delete",
				chatV1ConversationDeleteEventSchema,
				(event) => {
					if (this.#destroyed) return;
					for (const id of event.payload.conversationIds) {
						this.remove(id);
					}
				},
			),
		);

		if (typeof document !== "undefined") {
			const onVisibility = () => {
				if (this.#destroyed) return;
				if (document.visibilityState === "hidden") {
					this.#wasHidden = true;
					return;
				}
				if (!this.#wasHidden) return;
				this.#wasHidden = false;
				void this.#reconcile();
			};
			document.addEventListener("visibilitychange", onVisibility);
			this.#removeVisibility = () =>
				document.removeEventListener("visibilitychange", onVisibility);
		}
	}

	async destroy(): Promise<void> {
		this.#destroyed = true;
		const unlisteners = await Promise.all(this.#wsPromises);
		for (const unlisten of unlisteners) unlisten();
		this.#wsPromises = [];
		this.#removeVisibility?.();
		this.#removeVisibility = null;
		this.#reconcileListeners.clear();
	}

	onReconcile(handler: () => void | Promise<void>): () => void {
		this.#reconcileListeners.add(handler);
		return () => this.#reconcileListeners.delete(handler);
	}

	async #reconcile(): Promise<void> {
		const now = Date.now();
		if (now - this.#lastReconcileAt < 2000) return;
		this.#lastReconcileAt = now;
		await this.initial.catch(() => {});

		const activeId = this.#activeConversationId;
		for (const id of [...this.#messageCache.keys()]) {
			if (id !== activeId) this.#messageCache.delete(id);
		}

		try {
			const result = await getConversations(1);
			for (const incoming of result.entries) {
				const existing = this.entries.find(
					(e) => e.data.conversationId === incoming.data.conversationId,
				);
				if (existing) {
					existing.data.preview = incoming.data.preview;
					existing.data.lastActivityTimestamp =
						incoming.data.lastActivityTimestamp;
					if (incoming.data.conversationId !== activeId) {
						existing.data.unreadCount = incoming.data.unreadCount;
					}
				} else {
					this.entries.unshift(incoming);
				}
			}
			this.#sortEntries();
		} catch (error) {
			console.error("Failed to reconcile conversation list", error);
		}

		for (const handler of [...this.#reconcileListeners]) {
			try {
				await handler();
			} catch (error) {
				console.error("Reconcile listener failed", error);
			}
		}
	}

	async #load(page: number): Promise<void> {
		const result = await getConversations(page);
		this.entries.push(...result.entries);
		this.nextPage = result.nextPage;
	}

	async loadMore(): Promise<void> {
		if (this.loadingMore || this.nextPage === null) return;
		this.loadingMore = true;
		try {
			await this.#load(this.nextPage);
		} catch (error) {
			console.error(error);
			toast.error("Failed to load more conversations");
		} finally {
			this.loadingMore = false;
		}
	}

	async ensureLoaded(conversationId: string): Promise<void> {
		if (this.entries.some((e) => e.data.conversationId === conversationId)) {
			return;
		}
		try {
			const result = await getConversations(1);
			const newEntries = result.entries.filter(
				(entry) =>
					!this.entries.some(
						(e) => e.data.conversationId === entry.data.conversationId,
					),
			);
			this.entries.unshift(...newEntries);
		} catch (error) {
			console.error("Failed to sync conversation into sidebar", error);
		}
	}

	remove(conversationId: string) {
		this.#messageCache.delete(conversationId);
		const index = this.entries.findIndex(
			(e) => e.data.conversationId === conversationId,
		);
		let revert = () => {};
		if (index > -1) {
			const [removed] = this.entries.splice(index, 1);
			revert = () => {
				if (removed) {
					this.entries.splice(index, 0, removed);
				}
			};
		}
		return {
			revert,
		};
	}

	setActive(conversationId: string): void {
		this.#activeConversationId = conversationId;
		this.markRead(conversationId);
	}

	clearActive(conversationId: string): void {
		if (this.#activeConversationId === conversationId) {
			this.#activeConversationId = null;
		}
	}

	get hasUnread(): boolean {
		return this.entries.some(
			(entry) =>
				entry.data.unreadCount > 0 &&
				entry.data.lastActivityTimestamp > this.inboxLastViewedAt,
		);
	}

	markInboxViewed(): void {
		const now = Date.now();
		if (now <= this.inboxLastViewedAt) return;
		this.inboxLastViewedAt = now;
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(this.#inboxStorageKey(), String(now));
		}
	}

	#inboxStorageKey(): string {
		return `chat:inbox-last-viewed:${this.ourProfileId}`;
	}

	#loadInboxLastViewed(): number {
		if (typeof localStorage === "undefined") return 0;
		return (
			z.coerce
				.number()
				.int()
				.nonnegative()
				.safeParse(localStorage.getItem(this.#inboxStorageKey())).data ?? 0
		);
	}

	markRead(conversationId: string): void {
		const entry = this.entries.find(
			(e) => e.data.conversationId === conversationId,
		);
		if (entry) {
			const unreadCount = entry.data.unreadCount;
			if (unreadCount > 0) {
				entry.data.unreadCount = 0;
				markConversationAsRead({ conversationId }).catch((error) => {
					console.error("Failed to mark conversation as read", error);
					toast.error("Failed to mark conversation as read");
					entry.data.unreadCount = unreadCount;
				});
			}
		}
	}

	updatePreview({
		conversationId,
		preview,
		timestamp,
	}: {
		conversationId: Conversation["data"]["conversationId"];
		preview: Conversation["data"]["preview"];
		timestamp: Conversation["data"]["lastActivityTimestamp"];
	}): void {
		const entry = this.entries.find(
			(e) => e.data.conversationId === conversationId,
		);
		if (!entry) return;
		entry.data.preview = preview;
		entry.data.lastActivityTimestamp = timestamp;
		this.#sortEntries();
	}

	#sortEntries(): void {
		this.entries = this.entries.toSorted(
			(a, b) => b.data.lastActivityTimestamp - a.data.lastActivityTimestamp,
		);
	}

	getCachedConversation(id: string): CachedConversation | undefined {
		return this.#messageCache.get(id);
	}

	setCachedConversation(id: string, data: CachedConversation): void {
		this.#messageCache.set(id, data);
	}

	invalidateConversation(id: string): void {
		this.#messageCache.delete(id);
	}
}

export { ConversationsState };
