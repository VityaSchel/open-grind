import z from "zod";

import {
	getConversations,
	markConversationAsRead,
} from "$lib/api/conversation";
import { showErrorToast } from "$lib/api/error";
import { previewFromMessage } from "$lib/model/message";
import { reconciler } from "$lib/reconcile";
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
	refreshing = $state(false);
	inboxLastViewedAt = $state(0);
	initial: Promise<void> = $state(Promise.resolve());
	listScrollY = 0;

	readonly ourProfileId: number;
	#activeConversationId: string | null = null;
	#wsPromises: Promise<() => void>[] = [];
	#messageCache = new Map<string, CachedConversation>();
	#unsubscribeReconcile: () => void;
	#destroyed = false;

	constructor(ourProfileId: number) {
		this.ourProfileId = ourProfileId;
		this.inboxLastViewedAt = this.#loadInboxLastViewed();
		this.initial = this.#load(1);

		this.#unsubscribeReconcile = reconciler.subscribe(() => this.#reconcile());

		this.#wsPromises.push(
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
	}

	async destroy(): Promise<void> {
		this.#destroyed = true;
		this.#unsubscribeReconcile();
		const unlisteners = await Promise.all(this.#wsPromises);
		for (const unlisten of unlisteners) unlisten();
		this.#wsPromises = [];
	}

	async #reconcile(): Promise<void> {
		if (this.#destroyed || this.refreshing) return;
		this.refreshing = true;
		try {
			await this.initial.catch(() => {});

			const activeId = this.#activeConversationId;
			for (const id of [...this.#messageCache.keys()]) {
				if (id !== activeId) this.#messageCache.delete(id);
			}

			const oldestLoadedTs = this.entries.reduce(
				(min, e) => Math.min(min, e.data.lastActivityTimestamp),
				Number.POSITIVE_INFINITY,
			);
			const fetched = new Map<string, Conversation>();
			let oldestFetchedTs = Number.POSITIVE_INFINITY;
			let page: number | null = 1;
			let reachedEnd = false;
			for (let guard = 0; page !== null && guard < 100; guard++) {
				const result = await getConversations(page);
				for (const entry of result.entries) {
					if (!fetched.has(entry.data.conversationId)) {
						fetched.set(entry.data.conversationId, entry);
					}
					oldestFetchedTs = Math.min(
						oldestFetchedTs,
						entry.data.lastActivityTimestamp,
					);
				}
				page = result.nextPage;
				if (page === null) {
					reachedEnd = true;
					break;
				}
				if (oldestFetchedTs <= oldestLoadedTs) break;
			}
			// Continue lazy loading from wherever the refresh stopped.
			this.nextPage = reachedEnd ? null : page;

			for (const incoming of fetched.values()) {
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
					this.entries.push(incoming);
				}
			}

			const windowFloor = reachedEnd
				? Number.NEGATIVE_INFINITY
				: oldestFetchedTs;
			for (const entry of [...this.entries]) {
				const id = entry.data.conversationId;
				if (fetched.has(id)) continue;
				if (entry.data.lastActivityTimestamp > windowFloor) {
					this.remove(id);
				}
			}

			this.#sortEntries();
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to refresh conversations",
				error,
			});
		} finally {
			this.refreshing = false;
		}
	}

	async #load(page: number): Promise<void> {
		const result = await getConversations(page);
		const known = new Set(this.entries.map((e) => e.data.conversationId));
		for (const entry of result.entries) {
			if (!known.has(entry.data.conversationId)) this.entries.push(entry);
		}
		this.nextPage = result.nextPage;
	}

	refresh(): Promise<void> {
		return this.#reconcile();
	}

	retry(): void {
		if (this.#destroyed) return;
		this.entries = [];
		this.nextPage = null;
		this.initial = this.#load(1);
	}

	async loadMore(): Promise<void> {
		if (this.loadingMore || this.nextPage === null) return;
		this.loadingMore = true;
		try {
			await this.#load(this.nextPage);
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to load more conversations",
				error,
			});
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
			console.error(error);
			showErrorToast({
				label: "Failed to sync conversation into sidebar",
				error,
			});
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
		void this.markRead(conversationId);
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

	async markRead(conversationId: string) {
		const entry = this.entries.find(
			(e) => e.data.conversationId === conversationId,
		);
		if (entry) {
			const unreadCount = entry.data.unreadCount;
			if (unreadCount > 0) {
				entry.data.unreadCount = 0;
				try {
					await markConversationAsRead({ conversationId });
				} catch (error) {
					console.error(error);
					showErrorToast({
						label: "Failed to mark conversation as read",
						error,
					});
					entry.data.unreadCount = unreadCount;
				}
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
