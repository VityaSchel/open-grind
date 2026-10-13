/* eslint max-lines: ["error", { "max": 630, "skipBlankLines": true, "skipComments": true }] -- Keep lifecycle guards with the state they protect. */

import { page } from "$app/state";

import { showErrorToast } from "$lib/api/error-toast";
import {
	deleteConversationForMe,
	getConversations,
	setConversationMuted,
	setConversationPinned,
} from "$lib/api/messaging/conversations";
import { onProfileEdit } from "$lib/api/users/profiles";
import { RememberedConversationFlags } from "$lib/chat/conversation-flags";
import { sortConversations } from "$lib/chat/conversation-order";
import { ConversationReadRequests } from "$lib/chat/conversation-read-requests";
import { InboxViewedMarker } from "$lib/chat/inbox-last-viewed.svelte";
import { onInboxResync } from "$lib/chat/inbox-resync";
import {
	type ConversationFlagField,
	mergeConversation,
} from "$lib/chat/merge-conversation";
import { applyOptimisticBatch } from "$lib/chat/optimistic-batch";
import { previewFromMessage } from "$lib/model/messaging/message-preview";
import { below } from "$lib/util/breakpoints.svelte";
import { reconciler } from "$lib/util/reconcile";
import { SentinelPaging } from "$lib/util/sentinel-paging.svelte";
import {
	chatV1ConversationDeleteEventSchema,
	chatV1MessageSentEventSchema,
	ws,
} from "$lib/ws.svelte";
import type { ConversationFilterValues } from "$lib/model/messaging/conversation-filters";
import type { Conversation } from "$lib/model/messaging/conversations";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import type { CachedConversation } from "./cached-conversation";
import {
	applyFavoriteEdit,
	ConversationFilters,
} from "./conversation-filters.svelte";
import {
	type ConversationReadHandler,
	ConversationReads,
	type FetchedReadsHandler,
} from "./conversation-reads";
import { fetchConversationWindow } from "./conversation-window";
import { Drafts } from "./drafts.svelte";
import { FetchEpochs } from "./fetch-epochs";
import { PendingDeletes } from "./pending-deletes";
import { PendingFlags } from "./pending-flags";
import { SeenMessages } from "./seen-messages";
import { UnreadWhileMissing } from "./unread-while-missing";
import {
	type ConversationFlagUpdate,
	updateConversationFlag,
} from "./update-conversation-flag";

const singleColumnLayout = below("split");

export type IncomingMessageHandler = (incoming: {
	message: ApiResponseMessage;
	conversation: Conversation;
	inView: boolean;
}) => void;

class ConversationsState {
	entries = $state<Conversation[]>([]);
	nextPage = $state<number | null>(null);
	refreshing = $state(false);
	loading = $state(true);
	error: Error | null = $state(null);
	scrollY = 0;

	#initialLoad: Promise<unknown> = Promise.resolve();

	readonly ourProfileId: number;
	readonly drafts = new Drafts();
	readonly filters = new ConversationFilters();
	readonly inboxViewed: InboxViewedMarker;
	readonly paging: SentinelPaging;
	#onIncomingMessage: IncomingMessageHandler;
	#onConversationRead: ConversationReadHandler;
	#reads: ConversationReads;
	#readRequests = new ConversationReadRequests();
	#activeClaim: { conversationId: string } | null = null;
	#wsPromises: Promise<() => void>[] = [];
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read only by getCachedConversation(), never from a template or $derived
	#messageCache = new Map<string, CachedConversation>();
	#unsubscribeReconcile: () => void;
	#unsubscribeInboxResync = onInboxResync(() => void this.#syncLatest({}));
	#destroyed = false;
	#pendingFlags = new PendingFlags<ConversationFlagField>();
	#rememberedFlags = new RememberedConversationFlags();
	#pendingDeletes = new PendingDeletes();
	#seenMessages = new SeenMessages();
	#unreadWhileMissing = new UnreadWhileMissing();
	#fetches = new FetchEpochs();
	#refreshRequestedSinceFetchStart = false;
	#syncLatestInFlight: Promise<boolean> | null = null;
	#unsubscribeProfileEdits = onProfileEdit(({ profileId, patch }) => {
		if (patch.isFavorite === undefined) return;
		applyFavoriteEdit({
			entries: this.entries,
			profileId,
			isFavorite: patch.isFavorite,
		});
	});

	constructor({
		ourProfileId,
		onIncomingMessage,
		onConversationRead = () => {},
		onFetchedReads = () => {},
	}: {
		ourProfileId: number;
		onIncomingMessage: IncomingMessageHandler;
		onConversationRead?: ConversationReadHandler;
		onFetchedReads?: FetchedReadsHandler;
	}) {
		this.ourProfileId = ourProfileId;
		this.#onIncomingMessage = onIncomingMessage;
		this.#onConversationRead = onConversationRead;
		this.#reads = new ConversationReads({
			ourProfileId,
			known: (id) => this.#find(id),
			activeConversationId: () =>
				this.#activeClaim?.conversationId ?? null,
			clearUnread: (conversation) => (conversation.data.unreadCount = 0),
			markRead: (conversationId) => void this.markRead(conversationId),
			onRead: onConversationRead,
			onFetchedReads,
		});
		this.inboxViewed = new InboxViewedMarker({ profileId: ourProfileId });
		this.paging = new SentinelPaging({
			loadPage: (page) => this.#fetches.track(this.#load(page)),
			cursor: () => this.nextPage,
		});
		void this.#hardLoad();

		this.#unsubscribeReconcile = reconciler.subscribe(() =>
			this.#fetches.track(this.#reconcile()),
		);

		this.#wsPromises.push(
			ws.on(
				"chat.v1.message_sent",
				chatV1MessageSentEventSchema,
				(event) => {
					if (this.#destroyed) return;
					void this.#handleMessageSent(event.payload);
				},
			),
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
		this.#fetches.next();
		this.paging.destroy();
		this.drafts.destroy();
		this.#unsubscribeReconcile();
		this.#unsubscribeInboxResync();
		this.#unsubscribeProfileEdits();
		await this.#reads.destroy();
		const unlisteners = await Promise.all(this.#wsPromises);
		for (const unlisten of unlisteners) unlisten();
		this.#wsPromises = [];
	}

	setFilters(values: Partial<ConversationFilterValues>): void {
		if (this.filters.set(values)) this.retry();
	}

	async #handleMessageSent(message: ApiResponseMessage): Promise<void> {
		const conversationId = message.conversationId;
		const isIncoming = message.senderId !== this.ourProfileId;
		const counts = isIncoming && !message.unsent;
		let entry = this.#find(conversationId);

		if (this.#seenMessages.has(message.messageId)) {
			if (!this.#isActive(conversationId))
				this.invalidateConversation(conversationId);
			return;
		}
		this.#seenMessages.mark(message.messageId);

		if (entry) {
			if (counts) entry.data.unreadCount += 1;
			if (!this.#isActive(conversationId))
				this.invalidateConversation(conversationId);
			if (message.timestamp > entry.data.lastActivityTimestamp) {
				this.updatePreview({
					conversationId,
					preview: previewFromMessage(message),
					timestamp: message.timestamp,
				});
			}
		} else {
			if (counts) this.#unreadWhileMissing.add(conversationId);
			entry = await this.#loadMissing(conversationId);
			if (this.#destroyed) return;
			if (entry) {
				const arrived = this.#unreadWhileMissing.take(conversationId);
				const { data } = entry;
				data.unreadCount = Math.max(data.unreadCount, arrived);
			} else {
				if (counts) {
					this.#unreadWhileMissing.drop(conversationId);
					this.#readRequests.noteUnlistedUnread(conversationId);
				}
				this.#seenMessages.unmark(message.messageId);
			}
		}
		if (counts && this.#reads.seesOpenChat(conversationId))
			void this.markRead(conversationId);
		if (!isIncoming || message.unsent || !entry || entry.data.muted) return;
		const isInboxPageRoot = page.route.id === "/(protected)/chat";
		const twoColLayout = !singleColumnLayout.current;
		const isConversationsListVisible = isInboxPageRoot || twoColLayout;
		this.#onIncomingMessage({
			message,
			conversation: entry,
			inView:
				this.#isActive(conversationId) || isConversationsListVisible,
		});
	}

	async #reconcile(): Promise<void> {
		if (this.#destroyed) return;
		if (this.refreshing) {
			this.#refreshRequestedSinceFetchStart = true;
			return;
		}
		this.refreshing = true;
		let reconciled = false;
		try {
			await this.#initialLoad.catch(() => {});
			if (this.#destroyed) return;
			const fetchEpoch = this.#fetches.next();
			this.#refreshRequestedSinceFetchStart = false;
			const lastActivitiesAtFetchStart = this.#reads.lastActivities(
				this.entries,
			);

			const oldestLoadedTs = this.entries.reduce(
				(min, e) => Math.min(min, e.data.lastActivityTimestamp),
				Number.POSITIVE_INFINITY,
			);
			const { fetched, oldestFetchedTs, reachedEnd, nextPage } =
				await fetchConversationWindow({
					oldestLoadedTs,
					filters: this.filters.request,
				});
			if (this.#fetches.isStale(fetchEpoch)) return;
			this.nextPage = reachedEnd ? null : nextPage;

			const activeId = this.#activeClaim?.conversationId;
			for (const id of [...this.#messageCache.keys()]) {
				if (id !== activeId) this.#messageCache.delete(id);
			}
			this.#reads.reportFresh(fetched.values());

			for (const incoming of fetched.values()) {
				const existing = this.#find(incoming.data.conversationId);
				if (existing) {
					this.#mergeIncoming({
						existing,
						incoming,
						lastActivitiesAtFetchStart,
					});
				} else if (
					!this.#pendingDeletes.blocks({
						conversationId: incoming.data.conversationId,
						fetchEpoch,
					})
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
				if (
					entry.data.lastActivityTimestamp >
					(lastActivitiesAtFetchStart.get(id) ??
						Number.NEGATIVE_INFINITY)
				) {
					this.#refreshRequestedSinceFetchStart = true;
					continue;
				}
				if (
					this.#pendingDeletes.blocks({
						conversationId: id,
						fetchEpoch,
					})
				)
					continue;
				if (entry.data.lastActivityTimestamp > windowFloor) {
					this.remove(id);
					this.#reads.reportDropped({
						conversation: entry,
						startedWith: lastActivitiesAtFetchStart,
						dropsOnlyReadChats: this.filters.dropsOnlyReadChats,
					});
				}
			}

			this.#sortEntries();
			this.#reads.readOpenChat();
			this.error = null;
			reconciled = true;
		} catch (error) {
			if (this.#destroyed) return;
			console.error(error);
			showErrorToast({
				label: "Failed to refresh conversations",
				error,
				onRetry: () => void this.refresh(),
			});
		} finally {
			this.refreshing = false;
			if (reconciled || this.paging.failure === null) this.paging.rearm();
			this.#runRequestedRefresh();
		}
	}

	#runRequestedRefresh(): void {
		if (!this.#refreshRequestedSinceFetchStart) return;
		this.#refreshRequestedSinceFetchStart = false;
		void this.refresh();
	}

	#syncLatest(args: { errorLabel?: string }): Promise<boolean> {
		this.#syncLatestInFlight ??= this.#runSyncLatest(args).finally(() => {
			this.#syncLatestInFlight = null;
		});
		return this.#syncLatestInFlight;
	}

	async #runSyncLatest({
		errorLabel,
	}: {
		errorLabel?: string;
	}): Promise<boolean> {
		if (this.#destroyed) return false;
		// Claiming would make an in-flight #load drop the nextPage it fetched.
		const fetchEpoch = this.#fetches.current;
		const lastActivitiesAtFetchStart = this.#reads.lastActivities(
			this.entries,
		);
		try {
			const result = await getConversations({
				page: 1,
				filters: this.filters.request,
			});
			if (this.#fetches.isStale(fetchEpoch)) return !this.#destroyed;
			this.#reads.reportFresh(result.entries);
			for (const incoming of result.entries) {
				const existing = this.#find(incoming.data.conversationId);
				if (existing) {
					this.#mergeIncoming({
						existing,
						incoming,
						lastActivitiesAtFetchStart,
					});
				} else if (
					!this.#pendingDeletes.blocks({
						conversationId: incoming.data.conversationId,
						fetchEpoch,
					})
				) {
					this.entries.unshift(incoming);
				}
			}
			this.#sortEntries();
			this.#reads.readOpenChat();
			this.error = null;
			this.#runRequestedRefresh();
			return true;
		} catch (error) {
			if (this.#destroyed) return false;
			console.error(error);
			if (errorLabel) showErrorToast({ label: errorLabel, error });
			return false;
		}
	}

	async #load(page: number): Promise<void> {
		const fetchEpoch = this.#fetches.next();
		const result = await getConversations({
			page,
			filters: this.filters.request,
		});
		if (this.#fetches.isStale(fetchEpoch)) return;
		this.#reads.reportFresh(result.entries);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- function-local lookup, never mutated after construction
		const known = new Set(this.entries.map((e) => e.data.conversationId));
		for (const entry of result.entries) {
			const conversationId = entry.data.conversationId;
			if (
				!known.has(conversationId) &&
				!this.#pendingDeletes.blocks({ conversationId, fetchEpoch })
			) {
				this.entries.push(entry);
			}
		}
		this.nextPage = result.nextPage;
		this.#sortEntries();
		this.#reads.readOpenChat();
	}

	refresh(): Promise<void> {
		return this.#fetches.track(this.#reconcile());
	}

	retry(): void {
		if (this.#destroyed) return;
		this.entries = [];
		this.nextPage = null;
		this.paging.rearm();
		void this.#hardLoad();
	}

	async #hardLoad(): Promise<void> {
		this.loading = true;
		this.error = null;
		this.#initialLoad = this.#fetches.track(this.#load(1));
		const fetchEpoch = this.#fetches.current;
		try {
			await this.#initialLoad;
		} catch (error) {
			if (this.#destroyed || this.#fetches.isStale(fetchEpoch)) return;
			this.error =
				error instanceof Error ? error : new Error(String(error));
		} finally {
			if (!this.#fetches.isStale(fetchEpoch)) this.loading = false;
		}
	}

	async ensureLoaded(conversationId: string): Promise<boolean> {
		if (this.#destroyed) return false;
		if (this.#find(conversationId)) return true;
		const errorLabel = "Failed to sync conversation into sidebar";
		return this.#fetches.track(this.#syncLatest({ errorLabel }));
	}

	async #loadMissing(id: string): Promise<Conversation | undefined> {
		const joinedRunningSync = this.#syncLatestInFlight !== null;
		const syncSucceeded = await this.ensureLoaded(id);
		const joinedSyncWasTooEarly =
			joinedRunningSync && syncSucceeded && !this.#find(id);
		if (joinedSyncWasTooEarly) await this.ensureLoaded(id);
		return this.#find(id);
	}

	#isActive(conversationId: string): boolean {
		return conversationId === this.#activeClaim?.conversationId;
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
					this.entries.splice(
						Math.min(index, this.entries.length),
						0,
						removed,
					);
				}
			};
		}
		return { revert };
	}

	setActive(conversationId: string): () => void {
		const claim = { conversationId };
		this.#activeClaim = claim;
		if (!this.#find(conversationId))
			this.#readRequests.noteUnlistedUnread(conversationId);
		void this.markRead(conversationId);
		this.#onConversationRead(conversationId);
		return () => {
			if (this.#activeClaim === claim) this.#activeClaim = null;
		};
	}

	get hasUnread(): boolean {
		return this.inboxViewed.hasUnreadAmong(this.entries);
	}

	noteListViewed(): void {
		this.inboxViewed.noteListViewed(this.entries);
	}

	async markRead(conversationId: string): Promise<void> {
		const entry = this.#find(conversationId);
		if (entry) await this.#readRequests.read(entry);
		else if (this.#isActive(conversationId))
			await this.#readRequests.readUnlisted(conversationId);
	}

	#setFlag({
		conversationIds,
		...update
	}: ConversationFlagUpdate & { conversationIds: string[] }): Promise<void> {
		return updateConversationFlag({
			...update,
			entries: conversationIds.map((id) => this.#find(id)),
			pendingFlags: this.#pendingFlags,
			resort: () => this.#sortEntries(),
		});
	}

	setPinned({
		conversationIds,
		pinned,
	}: {
		conversationIds: string[];
		pinned: boolean;
	}): Promise<void> {
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

	setMuted({
		conversationIds,
		muted,
	}: {
		conversationIds: string[];
		muted: boolean;
	}): Promise<void> {
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

	#markServerDeleted(conversationId: string): void {
		this.drafts.forget(conversationId);
		this.#pendingDeletes.mark(conversationId);
		this.#pendingDeletes.settle({
			conversationId,
			fetchEpoch: this.#fetches.current,
		});
		this.#releaseAfterInFlightFetches([conversationId]);
	}

	#releaseAfterInFlightFetches(conversationIds: string[]): void {
		this.#fetches.afterInFlight(() => {
			for (const id of conversationIds) this.#pendingDeletes.release(id);
		});
	}

	async deleteConversations(conversationIds: string[]): Promise<void> {
		for (const id of conversationIds) this.#pendingDeletes.mark(id);
		try {
			const rolledBack = await applyOptimisticBatch({
				items: conversationIds.map((conversationId) => ({
					conversationId,
					revert: this.remove(conversationId).revert,
				})),
				request: async ({ conversationId }) => {
					await deleteConversationForMe({ conversationId });
					this.drafts.forget(conversationId);
				},
				rollback: ({ revert }) => revert(),
				errorLabel: "Failed to delete conversation",
			});
			if (rolledBack) this.#sortEntries();
		} finally {
			for (const id of conversationIds) {
				this.#pendingDeletes.settle({
					conversationId: id,
					fetchEpoch: this.#fetches.current,
				});
			}
			this.#releaseAfterInFlightFetches(conversationIds);
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
		return this.entries.find(
			(e) => e.data.conversationId === conversationId,
		);
	}

	#mergeIncoming({
		existing,
		incoming,
		lastActivitiesAtFetchStart,
	}: {
		existing: Conversation;
		incoming: Conversation;
		lastActivitiesAtFetchStart: Map<string, number>;
	}): void {
		const { conversationId } = incoming.data;
		this.#readRequests.noteSnapshot(conversationId);
		const keptLiveActivity = mergeConversation({
			existing,
			incoming,
			pendingFlags: this.#pendingFlags.fields(conversationId),
			lastActivityAtFetchStart:
				lastActivitiesAtFetchStart.get(conversationId) ??
				Number.NEGATIVE_INFINITY,
		});
		if (keptLiveActivity) this.#refreshRequestedSinceFetchStart = true;
	}

	#sortEntries(): void {
		this.entries = sortConversations(
			this.#rememberedFlags.applyTo(this.entries),
		);
	}

	getCachedConversation(id: string): CachedConversation | undefined {
		return this.#messageCache.get(id);
	}

	setCachedConversation({
		conversationId,
		data,
	}: {
		conversationId: string;
		data: CachedConversation;
	}): void {
		this.#messageCache.set(conversationId, data);
	}

	invalidateConversation(id: string): void {
		this.#messageCache.delete(id);
	}
}

export { ConversationsState };
