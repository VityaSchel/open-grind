import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
import { refreshMessagesById } from "$lib/api/messaging/messages";
import { now } from "$lib/util/clock";
import {
	chatV1MessageSentKindEventSchema,
	chatV1RefreshDynamicEventSchema,
	stopListening,
	ws,
} from "$lib/ws.svelte";
import { type OptimisticMessage, patchMessages } from "./merge-messages";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const PERIODIC_MIN_AGE_MS = 10 * 60 * 1000;
const TICK_MS = 60 * 1000;
const ALBUM_MESSAGE_TYPES = new Set([
	"Album",
	"ExpiringAlbum",
	"ExpiringAlbumV2",
]);

type Scope = "periodic" | "all";

export class DynamicMessagesRefresh {
	readonly #conversationId: string;
	readonly #messages: () => OptimisticMessage[];
	readonly #commit: (messages: OptimisticMessage[]) => void;
	readonly #paused: () => boolean;
	readonly #timer: ReturnType<typeof setInterval>;
	readonly #listeners: Promise<() => void>[];
	#lastPeriodicAt = Number.NEGATIVE_INFINITY;
	#inFlight = false;
	#allRequested = false;
	#destroyed = false;

	constructor({
		conversationId,
		messages,
		commit,
		paused,
	}: {
		conversationId: string;
		messages: () => OptimisticMessage[];
		commit: (messages: OptimisticMessage[]) => void;
		paused: () => boolean;
	}) {
		this.#conversationId = conversationId;
		this.#messages = messages;
		this.#commit = commit;
		this.#paused = paused;
		this.#listeners = [
			ws.on(
				"chat.v1.refresh_dynamic",
				chatV1RefreshDynamicEventSchema,
				({ payload }) => {
					if (payload.conversationId !== conversationId) return;
					if (payload.messageType === "Album")
						void this.#refresh("all");
				},
			),
			ws.on(
				"chat.v1.message_sent",
				chatV1MessageSentKindEventSchema,
				({ payload }) => {
					if (payload.conversationId !== conversationId) return;
					if (ALBUM_MESSAGE_TYPES.has(payload.type))
						queueMicrotask(() => void this.#refresh("all"));
				},
			),
		];
		this.#timer = setInterval(() => this.#tick(), TICK_MS);
		this.#tick();
	}

	destroy(): void {
		this.#destroyed = true;
		clearInterval(this.#timer);
		stopListening(this.#listeners);
	}

	#tick(): void {
		if (typeof document !== "undefined" && document.hidden) return;
		if (!appLifecycle.active) return;
		const sinceLast = now() - this.#lastPeriodicAt;
		if (sinceLast < REFRESH_INTERVAL_MS - TICK_MS / 2) return;
		void this.#refresh("periodic");
	}

	#dynamicMessages(scope: Scope): OptimisticMessage[] {
		const newest =
			scope === "all"
				? Number.POSITIVE_INFINITY
				: now() - PERIODIC_MIN_AGE_MS;
		return this.#messages().filter(
			(m) => m.status === "sent" && m.dynamic && m.timestamp <= newest,
		);
	}

	async #refresh(scope: Scope): Promise<void> {
		if (this.#destroyed || this.#paused()) return;
		if (this.#inFlight) {
			if (scope === "all") this.#allRequested = true;
			return;
		}
		if (scope === "periodic") this.#lastPeriodicAt = now();
		const requested = new Map(
			this.#dynamicMessages(scope).map((m) => [
				m.messageId,
				JSON.stringify(m),
			]),
		);
		if (requested.size === 0) return;
		this.#inFlight = true;
		try {
			const { messages } = await refreshMessagesById({
				conversationId: this.#conversationId,
				messageIds: [...requested.keys()],
			});
			if (this.#destroyed) return;
			const local = this.#messages();
			const current = new Map(
				local.map((m) => [m.messageId, JSON.stringify(m)]),
			);
			const untouched = messages.filter(
				(m) =>
					requested.has(m.messageId) &&
					current.get(m.messageId) === requested.get(m.messageId),
			);
			const patched = patchMessages({ local, server: untouched });
			if (patched.changed) this.#commit(patched.messages);
		} catch (error) {
			console.error("Failed to refresh dynamic messages", error);
		} finally {
			this.#inFlight = false;
			if (this.#allRequested) {
				this.#allRequested = false;
				void this.#refresh("all");
			}
		}
	}
}
