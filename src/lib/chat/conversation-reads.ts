import { onWindowReturn, windowFocused } from "$lib/platform/window-focus";
import {
	onPushDeeplinkOpened,
	openingPushDeeplink,
	pushDeeplinkAhead,
} from "$lib/push/opening-deeplink";
import { chatV1ConversationReadEventSchema, ws } from "$lib/ws.svelte";
import type { Conversation } from "$lib/model/messaging/conversations";

export type ConversationReadHandler = (conversationId: string) => void;
export type FetchedReadsHandler = (conversationIds: string[]) => void;

type KnownConversation = (conversationId: string) => Conversation | undefined;

export class ConversationReads {
	readonly #known: KnownConversation;
	readonly #activeConversationId: () => string | null;
	readonly #onFetchedReads: FetchedReadsHandler;
	readonly #markRead: ConversationReadHandler;
	readonly #onRead: ConversationReadHandler;
	readonly #newestActivity = new Map<string, number>();
	readonly #unwatchReturns: () => void;
	readonly #unwatchOpenedDeeplinks: () => void;
	readonly #unwatchOwnReads: Promise<() => void>;

	constructor({
		ourProfileId,
		known,
		activeConversationId,
		clearUnread,
		markRead,
		onRead,
		onFetchedReads,
	}: {
		ourProfileId: number;
		known: KnownConversation;
		activeConversationId: () => string | null;
		clearUnread: (conversation: Conversation) => void;
		markRead: ConversationReadHandler;
		onRead: ConversationReadHandler;
		onFetchedReads: FetchedReadsHandler;
	}) {
		this.#known = known;
		this.#activeConversationId = activeConversationId;
		this.#onFetchedReads = onFetchedReads;
		this.#markRead = markRead;
		this.#onRead = onRead;
		this.#unwatchReturns = onWindowReturn(() => {
			void pushDeeplinkAhead().then((ahead) => {
				if (!ahead) this.readOpenChat();
			});
		});
		this.#unwatchOpenedDeeplinks = onPushDeeplinkOpened(() =>
			this.readOpenChat(),
		);
		this.#unwatchOwnReads = ws.on(
			"chat.v1.conversation_read",
			chatV1ConversationReadEventSchema,
			({ payload: { conversationId, profileId, timestamp } }) => {
				if (profileId !== ourProfileId) return;
				const awayFromIt =
					conversationId === activeConversationId() &&
					!windowFocused();
				if (
					awayFromIt ||
					timestamp < this.#lastActivity(conversationId)
				)
					return;
				const conversation = known(conversationId);
				if (conversation) clearUnread(conversation);
				onRead(conversationId);
			},
		);
	}

	readOpenChat(): void {
		const active = this.#activeConversationId();
		if (active === null || !this.seesOpenChat(active)) return;
		this.#markRead(active);
		this.#onRead(active);
	}

	seesOpenChat(conversationId: string): boolean {
		return (
			conversationId === this.#activeConversationId() &&
			windowFocused() &&
			!openingPushDeeplink()
		);
	}

	reportFresh(snapshot: Iterable<Conversation>): void {
		const active = this.#activeConversationId();
		const read: string[] = [];
		for (const { data } of snapshot) {
			const { conversationId, lastActivityTimestamp } = data;
			const newest = this.#lastActivity(conversationId);
			this.#newestActivity.set(
				conversationId,
				Math.max(newest, lastActivityTimestamp),
			);
			const fresh = lastActivityTimestamp >= newest;
			if (fresh && conversationId !== active && data.unreadCount === 0)
				read.push(conversationId);
		}
		this.#onFetchedReads(read);
	}

	lastActivities(conversations: Conversation[]): Map<string, number> {
		return new Map(
			conversations.map(({ data }) => [
				data.conversationId,
				data.lastActivityTimestamp,
			]),
		);
	}

	reportDropped({
		conversation: { data },
		startedWith,
		dropsOnlyReadChats,
	}: {
		conversation: Conversation;
		startedWith: Map<string, number>;
		dropsOnlyReadChats: boolean;
	}): void {
		const unchanged =
			startedWith.get(data.conversationId) === data.lastActivityTimestamp;
		const active = data.conversationId === this.#activeConversationId();
		if (dropsOnlyReadChats && unchanged && !active)
			this.#onFetchedReads([data.conversationId]);
	}

	#lastActivity(conversationId: string): number {
		return Math.max(
			this.#known(conversationId)?.data.lastActivityTimestamp ??
				Number.NEGATIVE_INFINITY,
			this.#newestActivity.get(conversationId) ??
				Number.NEGATIVE_INFINITY,
		);
	}

	async destroy(): Promise<void> {
		this.#unwatchReturns();
		this.#unwatchOpenedDeeplinks();
		(await this.#unwatchOwnReads)();
	}
}
