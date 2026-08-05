import { createContext } from "svelte";

import { showErrorToast } from "$lib/api/error-toast";
import { markConversationAsRead } from "$lib/api/messaging/conversations";
import {
	ConversationUnavailableError,
	reactToMessage,
	sendMessage,
} from "$lib/api/messaging/messages";
import { getPreferences } from "$lib/app-data/preferences.svelte";
import { previewFromMessage } from "$lib/model/messaging/messages";
import { now } from "$lib/util/clock";
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
	Message as MessageType,
} from "$lib/model/messaging/messages";
import { getConversation } from "./messages";

export type OptimisticMessage = ApiResponseMessage & {
	status: "sent" | "pending" | "error";
};

const READ_DEBOUNCE_MS = 500;
const READ_MAX_WAIT_MS = 2000;

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
	#readQueue: { messageId: string; timestamp: number }[] = [];
	#readTimer: ReturnType<typeof setTimeout> | null = null;
	#readDeadline: number | null = null;
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
			ws.on("chat.v1.message_sent", chatV1MessageSentEventSchema, (event) => {
				if (this.#destroyed) return;
				const incoming = event.payload;
				if (incoming.conversationId !== this.conversationId) return;

				const existing = this.messages.find(
					(m) => m.messageId === incoming.messageId,
				);
				if (existing) {
					Object.assign(existing, incoming, { status: "sent" as const });
					this.#syncCache();
					return;
				}

				if (incoming.senderId === this.ourProfileId) {
					const pending = this.#matchPendingEcho(incoming);
					if (pending) {
						pending.status = "sent";
						pending.messageId = incoming.messageId;
						this.#syncCache();
						return;
					}
				}

				const newestTimestamp = this.messages.reduce(
					(max, m) => Math.max(max, m.timestamp),
					Number.NEGATIVE_INFINITY,
				);
				if (incoming.timestamp < newestTimestamp) return;

				const msg: OptimisticMessage = { ...incoming, status: "sent" };
				this.messages = [msg, ...this.messages];
				this.#syncCache();
				if (msg.senderId !== this.ourProfileId) {
					void this.reportRead({
						messageId: msg.messageId,
						timestamp: msg.timestamp,
					});
				}
			}),
			ws.on(
				"chat.v1.conversation_read",
				chatV1ConversationReadEventSchema,
				(event) => {
					if (this.#destroyed) return;
					if (event.payload.conversationId !== this.conversationId) return;
					if (event.payload.profileId === this.ourProfileId) return;
					if (this.#advanceLastRead(event.payload.timestamp)) this.#syncCache();
				},
			),
			ws.on(
				"chat.v1.conversation.delete",
				chatV1ConversationDeleteEventSchema,
				(event) => {
					if (this.#destroyed) return;
					if (!event.payload.conversationIds.includes(this.conversationId))
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
		if (this.#readTimer !== null) clearTimeout(this.#readTimer);
		if (this.#readQueue.length > 0) void this.#flushReadQueue();
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

			const serverById = new Map(
				result.messages.map((m) => [m.messageId, m] as const),
			);
			const oldestServerTs =
				result.messages.at(-1)?.timestamp ?? Number.POSITIVE_INFINITY;

			const newValue: OptimisticMessage[] = [];
			const seenLocalIds = new Set<string>();
			let dropped = 0;
			let updated = 0;
			for (const local of this.messages) {
				if (local.status !== "sent") {
					newValue.push(local);
					continue;
				}
				seenLocalIds.add(local.messageId);
				const serverVersion = serverById.get(local.messageId);
				if (serverVersion) {
					newValue.push({ ...serverVersion, status: "sent" as const });
					if (
						serverVersion.unsent !== local.unsent ||
						serverVersion.type !== local.type ||
						JSON.stringify(serverVersion.reactions) !==
							JSON.stringify(local.reactions)
					) {
						updated++;
					}
				} else if (local.timestamp < oldestServerTs) {
					newValue.push(local);
				} else {
					dropped++;
				}
			}

			const fresh: OptimisticMessage[] = [];
			for (const sv of result.messages) {
				if (seenLocalIds.has(sv.messageId)) continue;
				const msg: OptimisticMessage = { ...sv, status: "sent" as const };
				newValue.push(msg);
				fresh.push(msg);
			}

			this.#advanceLastRead(result.lastReadTimestamp);

			if (fresh.length === 0 && dropped === 0 && updated === 0) {
				this.#syncCache();
				return;
			}

			this.messages = removeDuplicateMessages(newValue);
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
				showErrorToast({
					label: "Failed to refresh messages",
					error,
				});
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
				result.messages.map((m) => ({
					...m,
					status: "sent" as const,
				})),
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
				...result.messages.map((m) => ({ ...m, status: "sent" as const })),
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

	send(message: MessageType): void {
		if (!this.profile) return;
		const tempId = `pending-${crypto.randomUUID()}`;
		const optimistic: OptimisticMessage = {
			...message,
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
		void this.#resolveMessage({ tempId, message });
	}

	async #resolveMessage({
		tempId,
		message,
	}: {
		tempId: string;
		message: MessageType;
	}): Promise<void> {
		try {
			const { messageId } = await sendMessage({
				toUserId: this.profile!.profileId,
				message,
			});
			const msg = this.messages.find((m) => m.messageId === tempId);
			if (msg) {
				msg.status = "sent";
				msg.messageId = messageId;
			}
			this.#syncCache();
			void this.#conversations.ensureLoaded(this.conversationId);
		} catch {
			const msg = this.messages.find((m) => m.messageId === tempId);
			if (msg) msg.status = "error";
			const latestSent = this.messages.find((m) => m.status === "sent");
			this.#updatePreview(latestSent);
		}
	}

	// Echoes come back in send order, so match the oldest pending; prefer a
	// same-type match when kinds arrive out of order.
	#matchPendingEcho(
		incoming: ApiResponseMessage,
	): OptimisticMessage | undefined {
		let fallback: OptimisticMessage | undefined;
		for (let i = this.messages.length - 1; i >= 0; i--) {
			const candidate = this.messages[i];
			if (candidate?.status !== "pending") continue;
			if (candidate.type === incoming.type) return candidate;
			fallback ??= candidate;
		}
		return fallback;
	}

	#advanceLastRead(timestamp: number | null): boolean {
		if (timestamp === null) return false;
		if (this.lastReadTimestamp !== null && timestamp <= this.lastReadTimestamp)
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
				({ revert: revertDeleteConversation } = this.#conversations.remove(
					this.conversationId,
				));
			}

			revert = () => {
				revertDeleteConversation();
				revertDeleteMessage();
			};
		}

		return {
			revert,
		};
	}

	reportRead({
		messageId,
		timestamp,
	}: {
		messageId: string;
		timestamp: number;
	}): void {
		if (this.lastReadTimestamp !== null && timestamp <= this.lastReadTimestamp)
			return;
		this.#readQueue.push({ messageId, timestamp });
		const current = now();
		this.#readDeadline ??= current + READ_MAX_WAIT_MS;
		if (this.#readTimer !== null) clearTimeout(this.#readTimer);
		const delay = Math.max(
			0,
			Math.min(READ_DEBOUNCE_MS, this.#readDeadline - current),
		);
		this.#readTimer = setTimeout(() => {
			void this.#flushReadQueue();
		}, delay);
	}

	async #flushReadQueue(): Promise<void> {
		const queue = this.#readQueue;
		this.#readQueue = [];
		this.#readTimer = null;
		this.#readDeadline = null;
		queue.sort((a, b) => a.timestamp - b.timestamp);
		const highest = queue.at(-1);
		if (!highest) return;
		const { revealMessageRead } = await getPreferences();
		if (revealMessageRead) {
			try {
				await markConversationAsRead({
					conversationId: this.conversationId,
					messageId: highest.messageId,
				});
			} catch (error) {
				console.error(error);
				showErrorToast({
					label: "Failed to mark conversation as read",
					error,
				});
			}
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
		return {
			revert,
		};
	}
}

function removeDuplicateMessages(
	messages: OptimisticMessage[],
): OptimisticMessage[] {
	const ids = new Set<string>();
	return messages
		.filter((m) => {
			if (ids.has(m.messageId)) return false;
			ids.add(m.messageId);
			return true;
		})
		.toSorted((a, b) => b.timestamp - a.timestamp);
}

export const [getConversationState, setConversationState] =
	createContext<() => ConversationState>();
