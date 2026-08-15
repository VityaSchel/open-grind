import { createContext } from "svelte";

import { showErrorToast } from "$lib/api/error-toast";
import { errorUrn } from "$lib/api/error-urn";
import { markConversationAsRead } from "$lib/api/messaging/conversations";
import {
	ConversationUnavailableError,
	reactToMessage,
	sendMessage,
} from "$lib/api/messaging/messages";
import { getPreferences } from "$lib/app-data/preferences.svelte";
import { previewFromMessage } from "$lib/model/messaging/message-preview";
import { reconciler } from "$lib/util/reconcile";
import {
	chatV1ConversationDeleteEventSchema,
	chatV1ConversationReadEventSchema,
	chatV1MessageSentEventSchema,
	ws,
} from "$lib/ws.svelte";
import type { ConversationsState } from "$lib/chat/conversations-state.svelte";
import type {
	ApiResponseMessage,
	MessageDraft,
	OutboundMessage,
} from "$lib/model/messaging/messages";
import {
	matchPendingEcho,
	mergeServerMessages,
	type OptimisticMessage,
	removeDuplicateMessages,
} from "./merge-messages";
import { getConversation } from "./messages";
import { ReadReceiptQueue } from "./read-receipts";

export type { OptimisticMessage };

export type ConversationProfile = Awaited<
	ReturnType<typeof getConversation>
>["profile"];

export class ConversationState {
	messages: OptimisticMessage[] = $state([]);
	profile: ConversationProfile | null = $state(null);
	pageKey: string | null = $state(null);
	loading = $state(true);
	loadingMore = $state(false);
	refreshing = $state(false);
	error: Error | null = $state(null);
	lastReadTimestamp: number | null = $state(null);

	readonly conversationId: string;
	readonly ourProfileId: number;

	#conversations: ConversationsState;
	#readReceipts = new ReadReceiptQueue({
		markRead: (messageId) => this.#markRead(messageId),
	});
	#unsubscribeReconcile: () => void;

	constructor({
		conversationId,
		ourProfileId,
		conversations,
	}: {
		conversationId: string;
		ourProfileId: number;
		conversations: ConversationsState;
	}) {
		this.conversationId = conversationId;
		this.ourProfileId = ourProfileId;
		this.#conversations = conversations;
		conversations.setActive(conversationId);
		this.lastReadTimestamp = null;
		void this.#initialLoad();

		this.#unsubscribeReconcile = reconciler.subscribe(() =>
			this.#reconcileMessages(),
		);

		this.#wsPromises.push(
			ws.on(
				"chat.v1.message_sent",
				chatV1MessageSentEventSchema,
				(event) => {
					if (this.#destroyed) return;
					const incoming = event.payload;
					if (incoming.conversationId !== this.conversationId) return;

					const existing = this.messages.find(
						(m) => m.messageId === incoming.messageId,
					);
					if (existing) {
						const moved = existing.timestamp !== incoming.timestamp;
						Object.assign(existing, incoming, {
							status: "sent" as const,
						});
						if (moved) this.#resortNewestFirst();
						this.#syncCache();
						return;
					}

					if (incoming.senderId === this.ourProfileId) {
						const pending = matchPendingEcho({
							messages: this.messages,
							incoming,
						});
						if (pending) {
							this.#adoptServerVersion({
								message: pending,
								serverMessageId: incoming.messageId,
								serverTimestamp: incoming.timestamp,
							});
							return;
						}
					}

					const newestTimestamp = this.messages.reduce(
						(max, m) => Math.max(max, m.timestamp),
						Number.NEGATIVE_INFINITY,
					);
					if (incoming.timestamp < newestTimestamp) return;

					const msg: OptimisticMessage = {
						...incoming,
						status: "sent",
					};
					this.messages = [msg, ...this.messages];
					this.#syncCache();
					if (msg.senderId !== this.ourProfileId) {
						void this.reportRead({
							messageId: msg.messageId,
							timestamp: msg.timestamp,
						});
					}
				},
			),
			ws.on(
				"chat.v1.conversation_read",
				chatV1ConversationReadEventSchema,
				(event) => {
					if (this.#destroyed) return;
					if (event.payload.conversationId !== this.conversationId)
						return;
					if (event.payload.profileId === this.ourProfileId) return;
					if (this.#advanceLastRead(event.payload.timestamp))
						this.#syncCache();
				},
			),
			ws.on(
				"chat.v1.conversation.delete",
				chatV1ConversationDeleteEventSchema,
				(event) => {
					if (this.#destroyed) return;
					if (
						!event.payload.conversationIds.includes(
							this.conversationId,
						)
					)
						return;
					void this.#reconcileMessages();
				},
			),
		);
	}

	#wsPromises: Promise<() => void>[] = [];

	#destroyed = false;
	#refreshRequestedSinceFetchStart = false;
	get destroyed(): boolean {
		return this.#destroyed;
	}
	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#conversations.clearActive(this.conversationId);
		for (const promise of this.#wsPromises) {
			promise.then((unlisten) => unlisten()).catch(console.error);
		}
		this.#wsPromises = [];
		this.#unsubscribeReconcile();
		this.#readReceipts.destroy();
	}

	async #reconcileMessages(): Promise<void> {
		if (this.#destroyed) return;
		if (this.loading || this.refreshing) {
			this.#refreshRequestedSinceFetchStart = true;
			return;
		}
		this.refreshing = true;
		this.#refreshRequestedSinceFetchStart = false;
		try {
			const result = await getConversation({
				conversationId: this.conversationId,
			});
			if (this.#destroyed) return;

			this.profile = result.profile;

			const { messages, fresh, changed } = mergeServerMessages({
				local: this.messages,
				server: result.messages,
			});

			this.#advanceLastRead(result.lastReadTimestamp);

			if (!changed) {
				this.#syncCache();
				return;
			}

			this.messages = messages;
			this.#updatePreview(this.messages.at(0));
			this.#syncCache();

			for (const m of fresh) {
				if (m.senderId === this.ourProfileId) continue;
				void this.reportRead({
					messageId: m.messageId,
					timestamp: m.timestamp,
				});
			}
		} catch (error) {
			if (this.#destroyed) return;
			console.error("Failed to reconcile messages", error);
			if (error instanceof ConversationUnavailableError) {
				this.error = error;
			} else {
				showErrorToast({ label: "Failed to refresh messages", error });
			}
		} finally {
			this.refreshing = false;
			this.#runRequestedRefresh();
		}
	}

	#runRequestedRefresh(): void {
		if (!this.#refreshRequestedSinceFetchStart) return;
		this.#refreshRequestedSinceFetchStart = false;
		void this.refresh();
	}

	refresh(): Promise<void> {
		return this.#reconcileMessages();
	}

	retry(): void {
		if (this.#destroyed) return;
		void this.#initialLoad();
	}

	async #initialLoad(): Promise<void> {
		this.error = null;
		const cached = this.#conversations.getCachedConversation(
			this.conversationId,
		);
		if (cached) {
			this.messages = cached.messages.map((m) => ({
				...m,
				status: "sent" as const,
			}));
			this.profile = cached.profile;
			this.pageKey = cached.pageKey;
			this.lastReadTimestamp = cached.lastReadTimestamp;
			this.loading = false;
			void this.#conversations.markRead(this.conversationId);
			void this.#reconcileMessages();
			return;
		}
		this.loading = true;
		try {
			const result = await getConversation({
				conversationId: this.conversationId,
			});
			void this.#conversations.markRead(this.conversationId);
			if (this.#destroyed) return;
			this.messages = removeDuplicateMessages(
				result.messages.map((m) => ({ ...m, status: "sent" as const })),
			);
			this.profile = result.profile;
			this.pageKey = result.pageKey;
			this.#updatePreview(this.messages.at(0));
			this.#advanceLastRead(result.lastReadTimestamp);
			this.#syncCache();
		} catch (err) {
			if (this.#destroyed) return;
			this.error = err instanceof Error ? err : new Error(String(err));
		} finally {
			this.loading = false;
			this.#runRequestedRefresh();
		}
	}

	async loadMore(): Promise<void> {
		if (this.loadingMore || this.pageKey === null) return;
		this.loadingMore = true;
		try {
			const result = await getConversation({
				conversationId: this.conversationId,
				pageKey: this.pageKey,
			});
			if (this.#destroyed) return;
			this.messages = removeDuplicateMessages([
				...this.messages,
				...result.messages.map((m) => ({
					...m,
					status: "sent" as const,
				})),
			]);
			this.pageKey = result.pageKey;
			this.#advanceLastRead(result.lastReadTimestamp);
			this.#syncCache();
		} catch (error) {
			if (this.#destroyed) return;
			console.error(error);
			if (error instanceof ConversationUnavailableError) {
				this.error = error;
			} else {
				showErrorToast({
					label: "Failed to load more messages",
					error,
				});
			}
		} finally {
			this.loadingMore = false;
		}
	}

	send(draft: MessageDraft): void {
		if (!this.profile) return;
		const tempId = `pending-${crypto.randomUUID()}`;
		const optimistic: OptimisticMessage = {
			...draft.optimistic,
			messageId: tempId,
			conversationId: this.conversationId,
			senderId: this.ourProfileId,
			timestamp: Date.now(),
			unsent: false,
			reactions: [],
			status: "pending" as const,
		};
		this.messages = removeDuplicateMessages([optimistic, ...this.messages]);
		this.#updatePreview(optimistic);
		void this.#resolveMessage({ tempId, message: draft.outbound });
	}

	async #resolveMessage({
		tempId,
		message,
	}: {
		tempId: string;
		message: OutboundMessage;
	}): Promise<void> {
		try {
			const sent = await sendMessage({
				toUserId: this.profile!.profileId,
				message,
			});
			const msg = this.messages.find((m) => m.messageId === tempId);
			if (msg) {
				this.#adoptServerVersion({
					message: msg,
					serverMessageId: sent.messageId,
					serverTimestamp: sent.timestamp,
				});
			} else {
				this.#syncCache();
			}
			void this.#conversations.ensureLoaded(this.conversationId);
		} catch (error) {
			const urn = errorUrn(error);
			console.error(
				`Failed to send message${urn === null ? "" : ` (${urn})`}`,
				error,
			);
			const msg = this.messages.find((m) => m.messageId === tempId);
			if (msg) {
				msg.status = "error";
				msg.sendError = error;
			}
			const latestSent = this.messages.find((m) => m.status === "sent");
			this.#updatePreview(latestSent);
		}
	}

	#adoptServerVersion({
		message,
		serverMessageId,
		serverTimestamp,
	}: {
		message: OptimisticMessage;
		serverMessageId: string;
		serverTimestamp: number;
	}): void {
		const wasNewestBeforeAdopting =
			this.messages.at(0)?.messageId === message.messageId;
		message.status = "sent";
		message.messageId = serverMessageId;
		message.timestamp = serverTimestamp;
		this.#resortNewestFirst();
		const newest = this.messages.at(0);
		const isNewestAfterAdopting = newest?.messageId === serverMessageId;
		if (wasNewestBeforeAdopting || isNewestAfterAdopting) {
			this.#updatePreview(newest);
		}
		this.#syncCache();
	}

	#resortNewestFirst(): void {
		this.messages = removeDuplicateMessages(this.messages);
	}

	#advanceLastRead(timestamp: number | null): boolean {
		if (timestamp === null) return false;
		if (
			this.lastReadTimestamp !== null &&
			timestamp <= this.lastReadTimestamp
		)
			return false;
		this.lastReadTimestamp = timestamp;
		return true;
	}

	#syncCache(): void {
		if (!this.profile) return;
		const cachedMessages: ApiResponseMessage[] = this.messages
			.filter((m) => m.status === "sent")
			.map(({ status: _status, ...rest }) => {
				void _status;
				return rest;
			});
		this.#conversations.setCachedConversation({
			conversationId: this.conversationId,
			data: {
				messages: cachedMessages,
				profile: this.profile,
				pageKey: this.pageKey,
				lastReadTimestamp: this.lastReadTimestamp,
			},
		});
	}

	#updatePreview(message: OptimisticMessage | undefined) {
		this.#conversations.updatePreview({
			conversationId: this.conversationId,
			preview: previewFromMessage(message),
			timestamp: message?.timestamp ?? -1,
		});
	}

	remove(messageId: string) {
		const isLatest = this.messages.at(0)?.messageId === messageId;

		let revert = () => {};
		const index = this.messages.findIndex((m) => m.messageId === messageId);
		const removed = this.messages[index];
		if (removed) {
			this.messages.splice(index, 1);
			if (isLatest) this.#updatePreview(this.messages.at(0));
			this.#syncCache();
			const revertDeleteMessage = () => {
				this.messages.splice(index, 0, removed);
				if (isLatest) this.#updatePreview(removed);
				this.#syncCache();
			};

			const isOnly = this.messages.length === 0;
			let revertDeleteConversation = () => {};
			if (isOnly) {
				({ revert: revertDeleteConversation } =
					this.#conversations.remove(this.conversationId));
			}

			revert = () => {
				revertDeleteConversation();
				revertDeleteMessage();
			};
		}

		return { revert };
	}

	reportRead({
		messageId,
		timestamp,
	}: {
		messageId: string;
		timestamp: number;
	}): void {
		if (
			this.lastReadTimestamp !== null &&
			timestamp <= this.lastReadTimestamp
		)
			return;
		this.#readReceipts.push({ messageId, timestamp });
	}

	async #markRead(messageId: string): Promise<void> {
		const { revealMessageRead } = await getPreferences();
		if (!revealMessageRead) return;
		try {
			await markConversationAsRead({
				conversationId: this.conversationId,
				messageId,
			});
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to mark conversation as read",
				error,
			});
		}
	}

	async reactTo({
		messageId,
		reactionType,
	}: {
		messageId: string;
		reactionType: number;
	}): Promise<void> {
		const msg = this.messages.find((m) => m.messageId === messageId);
		if (!msg) return;
		const optimistic = { reactionType, profileId: this.ourProfileId };
		msg.reactions.push(optimistic);
		this.#syncCache();
		try {
			await reactToMessage({
				conversationId: this.conversationId,
				messageId,
				reactionType,
			});
		} catch (err) {
			const idx = msg.reactions.findIndex((r) => r === optimistic);
			if (idx !== -1) msg.reactions.splice(idx, 1);
			this.#syncCache();
			throw err;
		}
	}

	markMessageAsUnsent(messageId: string) {
		const msg = this.messages.find((m) => m.messageId === messageId);
		let revert: () => void = () => {};
		if (msg) {
			const original = {
				unsent: msg.unsent,
				type: msg.type,
				body: msg.body,
			};
			msg.unsent = true;
			msg.type = "Unsent";
			msg.body = null;
			this.#syncCache();
			this.#updatePreview(msg);
			revert = () => {
				msg.unsent = original.unsent;
				msg.type = original.type;
				msg.body = original.body;
				this.#syncCache();
				this.#updatePreview(msg);
			};
		}
		return { revert };
	}
}

export const [getConversationState, setConversationState] =
	createContext<() => ConversationState>();
