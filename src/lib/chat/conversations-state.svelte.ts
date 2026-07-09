import z from "zod";

import { showErrorToast } from "$lib/api/error";
import {
	deleteConversationForMe,
	getConversations,
	markConversationAsRead,
	setConversationMuted,
	setConversationPinned,
} from "$lib/api/messaging/conversations";
import { showIncomingMessageToast } from "$lib/components/incoming-message-toast/incoming-message-toast-manager";
import { previewFromMessage } from "$lib/model/messaging/messages";
import { reconciler } from "$lib/util/reconcile";
import {
	chatV1ConversationDeleteEventSchema,
	chatV1MessageSentEventSchema,
	ws,
} from "$lib/ws.svelte";
import type { Conversation } from "$lib/model/messaging/conversations";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";

type OptimisticFlagField = "pinned" | "muted";

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
	#pendingFlags = new Map<string, Map<OptimisticFlagField, number>>();
	#pendingDeletes = new Map<
		string,
		{ refs: number; inFlight: number; lastSettledEpoch: number }
	>();
	#inFlightFetches = new Set<Promise<unknown>>();
	#fetchEpoch = 0;

	constructor(ourProfileId: number) {
		this.ourProfileId = ourProfileId;
		this.inboxLastViewedAt = this.#loadInboxLastViewed();
		this.initial = this.#trackFetch(this.#load(1));

		this.#unsubscribeReconcile = reconciler.subscribe(() =>
			this.#trackFetch(this.#reconcile()),
		);

		this.#wsPromises.push(
			ws.on("chat.v1.message_sent", chatV1MessageSentEventSchema, (event) => {
				if (this.#destroyed) return;
				void this.#handleMessageSent(event.payload);
			}),
			ws.on(
				"chat.v1.conversation.delete",
				chatV1ConversationDeleteEventSchema,
				(event) => {
					if (this.#destroyed) return;
					for (const id of event.payload.conversationIds) {
						this.remove(id);
						this.#markServerDeleted(id);
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

	async #handleMessageSent(message: ApiResponseMessage): Promise<void> {
		const isActive = message.conversationId === this.#activeConversationId;
		const isIncoming = message.senderId !== this.ourProfileId;
		let entry = this.#find(message.conversationId);

		if (entry && message.timestamp <= entry.data.lastActivityTimestamp) {
			if (!isActive) this.invalidateConversation(message.conversationId);
			return;
		}

		if (entry) {
			if (!isActive && isIncoming) {
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
			await this.ensureLoaded(message.conversationId);
			entry = this.#find(message.conversationId);
		}
		if (!isActive && isIncoming && entry && !entry.data.muted) {
			this.#showIncomingMessageToast({ message, conversation: entry });
		}
	}

	async #reconcile(): Promise<void> {
		if (this.#destroyed || this.refreshing) return;
		this.refreshing = true;
		const fetchEpoch = ++this.#fetchEpoch;
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
				const currentPage: number = page;
				const result = await getConversations(currentPage);
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
				const existing = this.#find(incoming.data.conversationId);
				if (existing) {
					this.#mergeIncoming(existing, incoming);
				} else if (
					!this.#isPendingDelete(incoming.data.conversationId, fetchEpoch)
				) {
					this.entries.push(incoming);
				}
			}

			const windowFloor = reachedEnd
				? Number.NEGATIVE_INFINITY
				: oldestFetchedTs;
			for (const entry of [...this.entries]) {
				const id = entry.data.conversationId;
				if (fetched.has(id)) continue;
				if (this.#isPendingDelete(id, fetchEpoch)) continue;
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

	async #syncLatest({ errorLabel }: { errorLabel: string }): Promise<void> {
		const fetchEpoch = ++this.#fetchEpoch;
		try {
			const result = await getConversations(1);
			for (const incoming of result.entries) {
				const existing = this.#find(incoming.data.conversationId);
				if (existing) {
					this.#mergeIncoming(existing, incoming);
				} else if (
					!this.#isPendingDelete(incoming.data.conversationId, fetchEpoch)
				) {
					this.entries.unshift(incoming);
				}
			}
			this.#sortEntries();
		} catch (error) {
			console.error(error);
			showErrorToast({ label: errorLabel, error });
		}
	}

	async #load(page: number): Promise<void> {
		const fetchEpoch = ++this.#fetchEpoch;
		const result = await getConversations(page);
		const known = new Set(this.entries.map((e) => e.data.conversationId));
		for (const entry of result.entries) {
			const conversationId = entry.data.conversationId;
			if (
				!known.has(conversationId) &&
				!this.#isPendingDelete(conversationId, fetchEpoch)
			) {
				this.entries.push(entry);
			}
		}
		this.nextPage = result.nextPage;
		this.#sortEntries();
	}

	#trackFetch<T>(fetch: Promise<T>): Promise<T> {
		this.#inFlightFetches.add(fetch);
		void fetch
			.catch(() => {})
			.finally(() => this.#inFlightFetches.delete(fetch));
		return fetch;
	}

	refresh(): Promise<void> {
		return this.#trackFetch(this.#reconcile());
	}

	retry(): void {
		if (this.#destroyed) return;
		this.entries = [];
		this.nextPage = null;
		this.initial = this.#trackFetch(this.#load(1));
	}

	async loadMore(): Promise<void> {
		if (this.loadingMore || this.nextPage === null) return;
		this.loadingMore = true;
		try {
			await this.#trackFetch(this.#load(this.nextPage));
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
		if (this.#find(conversationId)) return;
		await this.#trackFetch(
			this.#syncLatest({
				errorLabel: "Failed to sync conversation into sidebar",
			}),
		);
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
				if (removed && !this.#find(conversationId)) {
					this.entries.splice(Math.min(index, this.entries.length), 0, removed);
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
				!entry.data.muted &&
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

	#showIncomingMessageToast({
		message,
		conversation,
	}: {
		message: ApiResponseMessage;
		conversation: Conversation;
	}): void {
		showIncomingMessageToast({
			message,
			sender: {
				name: conversation.data.name,
				avatarMediaHash: conversation.data.participants[0].primaryMediaHash,
			},
			conversationId: conversation.data.conversationId,
		});
	}

	async markRead(conversationId: string) {
		const entry = this.#find(conversationId);
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

	async #requestWithRollback<T>({
		items,
		request,
		rollback,
		errorLabel,
	}: {
		items: T[];
		request: (item: T) => Promise<unknown>;
		rollback: (item: T) => void;
		errorLabel: string;
	}): Promise<void> {
		const results = await Promise.allSettled(items.map(request));
		const failures: T[] = [];
		let error: unknown = null;
		results.forEach((result, index) => {
			if (result.status !== "rejected") return;
			failures.push(items[index]);
			error ??= result.reason;
		});
		if (failures.length === 0) return;
		for (const item of failures.toReversed()) rollback(item);
		this.#sortEntries();
		console.error(error);
		showErrorToast({ label: errorLabel, error });
	}

	#markPendingFlag(conversationId: string, field: OptimisticFlagField): void {
		const counts =
			this.#pendingFlags.get(conversationId) ??
			new Map<OptimisticFlagField, number>();
		counts.set(field, (counts.get(field) ?? 0) + 1);
		this.#pendingFlags.set(conversationId, counts);
	}

	#unmarkPendingFlag(conversationId: string, field: OptimisticFlagField): void {
		const counts = this.#pendingFlags.get(conversationId);
		const count = counts?.get(field);
		if (counts === undefined || count === undefined) return;
		if (count > 1) {
			counts.set(field, count - 1);
		} else {
			counts.delete(field);
			if (counts.size === 0) this.#pendingFlags.delete(conversationId);
		}
	}

	async #setFlag({
		conversationIds,
		field,
		value,
		request,
		errorLabel,
	}: {
		conversationIds: string[];
		field: OptimisticFlagField;
		value: boolean;
		request: (conversationId: string) => Promise<unknown>;
		errorLabel: string;
	}): Promise<void> {
		const targets = conversationIds
			.map((id) => this.#find(id))
			.filter(
				(entry): entry is Conversation =>
					entry !== undefined && entry.data[field] !== value,
			);
		if (targets.length === 0) return;
		for (const entry of targets) {
			entry.data[field] = value;
			this.#markPendingFlag(entry.data.conversationId, field);
		}
		if (field === "pinned") this.#sortEntries();

		try {
			await this.#requestWithRollback({
				items: targets,
				request: (entry) => request(entry.data.conversationId),
				rollback: (entry) => {
					entry.data[field] = !value;
				},
				errorLabel,
			});
		} finally {
			for (const entry of targets) {
				this.#unmarkPendingFlag(entry.data.conversationId, field);
			}
		}
	}

	setPinned(conversationIds: string[], pinned: boolean): Promise<void> {
		return this.#setFlag({
			conversationIds,
			field: "pinned",
			value: pinned,
			request: (conversationId) =>
				setConversationPinned({ conversationId, pinned }),
			errorLabel: pinned
				? "Failed to pin conversation"
				: "Failed to unpin conversation",
		});
	}

	setMuted(conversationIds: string[], muted: boolean): Promise<void> {
		return this.#setFlag({
			conversationIds,
			field: "muted",
			value: muted,
			request: (conversationId) =>
				setConversationMuted({ conversationId, muted }),
			errorLabel: muted
				? "Failed to mute conversation"
				: "Failed to unmute conversation",
		});
	}

	#markPendingDelete(conversationId: string): void {
		const tombstone = this.#pendingDeletes.get(conversationId) ?? {
			refs: 0,
			inFlight: 0,
			lastSettledEpoch: -1,
		};
		tombstone.refs += 1;
		tombstone.inFlight += 1;
		this.#pendingDeletes.set(conversationId, tombstone);
	}

	#settlePendingDelete(conversationId: string): void {
		const tombstone = this.#pendingDeletes.get(conversationId);
		if (tombstone === undefined) return;
		tombstone.inFlight -= 1;
		tombstone.lastSettledEpoch = this.#fetchEpoch;
	}

	#releasePendingDelete(conversationId: string): void {
		const tombstone = this.#pendingDeletes.get(conversationId);
		if (tombstone === undefined) return;
		tombstone.refs -= 1;
		if (tombstone.refs === 0) {
			this.#pendingDeletes.delete(conversationId);
		}
	}

	#isPendingDelete(conversationId: string, fetchEpoch: number): boolean {
		const tombstone = this.#pendingDeletes.get(conversationId);
		if (tombstone === undefined) return false;
		return tombstone.inFlight > 0 || fetchEpoch <= tombstone.lastSettledEpoch;
	}

	#markServerDeleted(conversationId: string): void {
		this.#markPendingDelete(conversationId);
		this.#settlePendingDelete(conversationId);
		void Promise.allSettled([...this.#inFlightFetches]).then(() =>
			this.#releasePendingDelete(conversationId),
		);
	}

	async deleteConversations(conversationIds: string[]): Promise<void> {
		for (const id of conversationIds) this.#markPendingDelete(id);
		try {
			await this.#requestWithRollback({
				items: conversationIds.map((conversationId) => ({
					conversationId,
					revert: this.remove(conversationId).revert,
				})),
				request: ({ conversationId }) =>
					deleteConversationForMe({ conversationId }),
				rollback: ({ revert }) => revert(),
				errorLabel: "Failed to delete conversation",
			});
		} finally {
			for (const id of conversationIds) this.#settlePendingDelete(id);
			void Promise.allSettled([...this.#inFlightFetches]).then(() => {
				for (const id of conversationIds) this.#releasePendingDelete(id);
			});
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
		const entry = this.#find(conversationId);
		if (!entry) return;
		entry.data.preview = preview;
		entry.data.lastActivityTimestamp = timestamp;
		this.#sortEntries();
	}

	#find(conversationId: string): Conversation | undefined {
		return this.entries.find((e) => e.data.conversationId === conversationId);
	}

	#mergeIncoming(existing: Conversation, incoming: Conversation): void {
		const { unreadCount, ...data } = incoming.data;
		const pendingFlags = this.#pendingFlags.get(incoming.data.conversationId);
		for (const field of pendingFlags?.keys() ?? []) {
			data[field] = existing.data[field];
		}
		Object.assign(existing.data, data);
		if (incoming.data.conversationId !== this.#activeConversationId) {
			existing.data.unreadCount = unreadCount;
		}
	}

	#sortEntries(): void {
		this.entries = this.entries.toSorted(
			(a, b) =>
				Number(b.data.pinned) - Number(a.data.pinned) ||
				b.data.lastActivityTimestamp - a.data.lastActivityTimestamp,
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
