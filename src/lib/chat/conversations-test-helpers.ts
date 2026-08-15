import { expect, vi } from "vitest";

import type { Conversation } from "$lib/model/messaging/conversations";
import type { ConversationsState } from "./conversations-state.svelte";

export const OUR_ID = 1;
export const PEER_ID = 2;

export function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

export function conversation(
	conversationId: string,
	lastActivityTimestamp: number,
	overrides: Partial<Conversation["data"]> = {},
): Conversation {
	return {
		type: "full_conversation_v1",
		data: {
			conversationId,
			name: `Conversation ${conversationId}`,
			participants: [
				{
					profileId: PEER_ID,
					primaryMediaHash: null,
					lastOnline: null,
					onlineUntil: null,
					distanceMetres: null,
					position: null,
					isInAList: false,
					hasDatingPotential: false,
				},
			],
			lastActivityTimestamp,
			unreadCount: 0,
			preview: null,
			muted: false,
			pinned: false,
			favorite: false,
			rightNow: "none",
			onlineUntil: null,
			hasUnreadThrob: false,
			...overrides,
		},
	} as unknown as Conversation;
}

export function incomingMessage(
	conversationId: string,
	timestamp: number,
	senderId: number,
) {
	return {
		messageId: `m-${conversationId}-${timestamp}`,
		conversationId,
		senderId,
		timestamp,
		unsent: false,
		reactions: [],
		type: "Text",
		body: { text: "hi" },
	};
}

export function entryFor(state: ConversationsState, conversationId: string) {
	const entry = state.entries.find(
		(e) => e.data.conversationId === conversationId,
	);
	if (!entry) throw new Error(`no entry for ${conversationId}`);
	return entry;
}

export const microtasks = () => new Promise((r) => setTimeout(r, 0));

export async function settled(state: ConversationsState) {
	await vi.waitFor(() => expect(state.loading).toBe(false));
}
