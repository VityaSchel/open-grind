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
import {
	offerEntitlementBypass,
	reportRefusedDespiteBypass,
} from "$lib/entitlements/bypass.svelte";
import { previewFromMessage } from "$lib/model/messaging/message-preview";
import { reconciler } from "$lib/util/reconcile";
import {
	chatV1ConversationDeleteEventSchema,
	chatV1ConversationReadEventSchema,
	chatV1MessageSentEventSchema,
	stopListening,
	ws,
} from "$lib/ws.svelte";
import type { ConversationsState } from "$lib/chat/conversations-state.svelte";
import type {
	ApiResponseMessage,
	MessageDraft,
	OutboundMessage,
} from "$lib/model/messaging/messages";
import { DynamicMessagesRefresh } from "./dynamic-refresh";
import {
	matchPendingEcho,
	mergeServerMessages,
	type OptimisticMessage,
	previewedMessage,
	removeDuplicateMessages,
	sentMessages,
} from "./merge-messages";
import { getConversation } from "./messages";
import { ReadReceiptQueue } from "./read-receipts";

export type { OptimisticMessage };

export type ConversationProfile = Awaited<
	ReturnType<typeof getConversation>
>["profile"];

function asSent(message: ApiResponseMessage): OptimisticMessage {
	return { ...message, status: "sent" };
}

type MessageDelivery = {
	tempId: string;
	message: OutboundMessage;
	replyToMessageId?: string;
};

export class ConversationState {
	messages: OptimisticMessage[] = $state([]);
	profile: ConversationProfile | null = $state(null);
	pageKey: string | null = $state(null);
	loading = $state(true);
	loadingMore = $state(false);
	refreshing = $state(false);
	error: Error | null = $state(null);
	lastReadTimestamp: number | null = $state(null);
	// Resolved from the stored id on every read, so unsending, deleting or
	// failing to load the target drops the quote with no clearing code.
	readonly replyTo: ApiResponseMessage | null = $derived.by(() => {
		const messageId = this.#conversations.drafts.replyTo(
			this.conversationId,
		);
		if (messageId === null) return null;
		const target = this.messages.find(
			(message) => message.messageId === messageId,
		);
		return target && !target.unsent ? target : null;
	});

	readonly conversationId: string;
	readonly ourProfileId: number;

	#conversations: ConversationsState;
	#readReceipts = new ReadReceiptQueue({
		markRead: (messageId) => this.#markRead(messageId),
	});
	#unsubscribeReconcile: () => void;
	readonly dynamicRefresh: DynamicMessagesRefresh;

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
								server: incoming,
							});
							return;
						}
					}

					const newestTimestamp = this.messages.reduce(
						(max, m) => Math.max(max, m.timestamp),
						Number.NEGATIVE_INFINITY,
					);
					if (incoming.timestamp < newestTimestamp) return;

					const msg = asSent(incoming);
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
		this.dynamicRefresh = new DynamicMessagesRefresh({
			conversationId,
			messages: () => this.messages,
			commit: (messages) => this.#commitMessages(messages),
			reconcile: () => this.#reconcileMessages(),
			paused: () => this.error !== null,
		});
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
		stopListening(this.#wsPromises);
		this.#wsPromises = [];
		this.#unsubscribeReconcile();
		this.#readReceipts.destroy();
		this.dynamicRefresh.destroy();
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
			this.error = null;

			const { messages, fresh, changed } = mergeServerMessages({
				local: this.messages,
				server: result.messages,
			});

			this.#advanceLastRead(result.lastReadTimestamp);

			if (!changed) {
				this.#syncCache();
				return;
			}

			this.#commitMessages(messages);

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
				showErrorToast({
					label: "Failed to refresh messages",
					error,
					onRetry: () => void this.refresh(),
				});
			}
		} finally {
			this.refreshing = false;
			this.#runRequestedRefresh();
		}
	}

	#commitMessages(messages: OptimisticMessage[]): void {
		this.messages = messages;
		this.#updatePreview();
		this.#syncCache();
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
			this.messages = cached.messages.map(asSent);
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
				result.messages.map(asSent),
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

	async loadMore({
		commit = (apply) => apply(),
	}: { commit?: (apply: () => void) => void } = {}): Promise<void> {
		if (this.loadingMore || this.pageKey === null) return;
		this.loadingMore = true;
		try {
			const result = await getConversation({
				conversationId: this.conversationId,
				pageKey: this.pageKey,
			});
			if (this.#destroyed) return;
			commit(() => {
				this.messages = removeDuplicateMessages([
					...this.messages,
					...result.messages.map(asSent),
				]);
				this.pageKey = result.pageKey;
				this.loadingMore = false;
				this.#advanceLastRead(result.lastReadTimestamp);
				this.#syncCache();
			});
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

	setReplyTo(message: ApiResponseMessage): void {
		this.#conversations.drafts.setReplyTo({
			conversationId: this.conversationId,
			messageId: message.messageId,
		});
	}

	clearReplyTo(): void {
		this.#conversations.drafts.clearReplyTo(this.conversationId);
	}

	// One call per batch: the target is read once and cleared once, so every
	// message of a multi-photo reply quotes it, not just the first.
	send(drafts: MessageDraft[]): void {
		if (!this.profile) return;
		const replyToMessage = this.replyTo;
		for (const draft of drafts) this.#sendOne({ draft, replyToMessage });
		if (replyToMessage) this.clearReplyTo();
	}

	#sendOne({
		draft,
		replyToMessage,
	}: {
		draft: MessageDraft;
		replyToMessage: ApiResponseMessage | null;
	}): void {
		const tempId = `pending-${crypto.randomUUID()}`;
		const optimistic: OptimisticMessage = {
			...draft.optimistic,
			messageId: tempId,
			conversationId: this.conversationId,
			senderId: this.ourProfileId,
			timestamp: Date.now(),
			unsent: false,
			reactions: [],
			dynamic: false,
			replyToMessage,
			status: "pending" as const,
		};
		this.messages = removeDuplicateMessages([optimistic, ...this.messages]);
		this.#updatePreview(optimistic);
		void this.#deliverMessage({
			tempId,
			message: draft.outbound,
			replyToMessageId: replyToMessage?.messageId,
		});
	}

	async #deliverMessage(delivery: MessageDelivery): Promise<void> {
		try {
			await this.#attemptSend(delivery);
		} catch (error) {
			const urn = errorUrn(error);
			console.error(
				`Failed to send message${urn === null ? "" : ` (${urn})`}`,
				error,
			);
			if (
				!this.#destroyed &&
				delivery.message.type === "ExpiringImage" &&
				urn === "urn:gr:err:entitlement_limit"
			) {
				const lease = await offerEntitlementBypass({
					reason: "Daily expiring photo limit reached. Sending more requires a Grindr subscription.",
				});
				if (lease === null) return;
				await this.#attemptSend(delivery)
					.catch(reportRefusedDespiteBypass)
					.finally(lease.release);
			}
		}
	}

	async #attemptSend({
		tempId,
		message,
		replyToMessageId,
	}: MessageDelivery): Promise<void> {
		if (this.#destroyed) return;
		const findOptimistic = () =>
			this.messages.find((m) => m.messageId === tempId);
		const sending = findOptimistic();
		if (!sending) return;
		sending.status = "pending";
		sending.sendError = undefined;
		try {
			const sent = await sendMessage({
				toUserId: this.profile!.profileId,
				message,
				replyToMessageId,
			});
			if (this.#destroyed) return;
			const msg = findOptimistic();
			if (msg) {
				this.#adoptServerVersion({ message: msg, server: sent });
			} else {
				this.#syncCache();
			}
			void this.#conversations.ensureLoaded(this.conversationId);
		} catch (error) {
			const msg = findOptimistic();
			if (msg) {
				msg.status = "error";
				msg.sendError = error;
			}
			if (!this.#destroyed) this.#updatePreview();
			throw error;
		}
	}

	#adoptServerVersion({
		message,
		server,
	}: {
		message: OptimisticMessage;
		server: ApiResponseMessage;
	}): void {
		const wasPreviewed =
			previewedMessage(this.messages)?.messageId === message.messageId;
		Object.assign(message, server, { status: "sent" as const });
		this.#resortNewestFirst();
		const isPreviewed =
			previewedMessage(this.messages)?.messageId === server.messageId;
		if (wasPreviewed || isPreviewed) this.#updatePreview();
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
		this.#conversations.setCachedConversation({
			conversationId: this.conversationId,
			data: {
				messages: sentMessages(this.messages),
				profile: this.profile,
				pageKey: this.pageKey,
				lastReadTimestamp: this.lastReadTimestamp,
			},
		});
	}

	#updatePreview(message = previewedMessage(this.messages)) {
		this.#conversations.updatePreview({
			conversationId: this.conversationId,
			preview: previewFromMessage(message),
			timestamp: message?.timestamp ?? -1,
		});
	}

	remove(messageId: string) {
		const previewed =
			previewedMessage(this.messages)?.messageId === messageId;

		let revert = () => {};
		const index = this.messages.findIndex((m) => m.messageId === messageId);
		const removed = this.messages[index];
		if (removed) {
			this.messages.splice(index, 1);
			if (previewed) this.#updatePreview();
			this.#syncCache();
			const revertDeleteMessage = () => {
				this.messages.splice(index, 0, removed);
				if (previewed) this.#updatePreview(removed);
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
			if (!this.#destroyed) this.#syncCache();
			throw err;
		}
	}

	markMessageAsUnsent(messageId: string) {
		const previewed =
			previewedMessage(this.messages)?.messageId === messageId;

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
			if (previewed) this.#updatePreview(msg);
			revert = () => {
				msg.unsent = original.unsent;
				msg.type = original.type;
				msg.body = original.body;
				this.#syncCache();
				if (previewed) this.#updatePreview(msg);
			};
		}
		return { revert };
	}
}

export const [getConversationState, setConversationState] =
	createContext<() => ConversationState>();
