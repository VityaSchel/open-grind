import type { Conversation } from "$lib/model/messaging/conversations";

type OmittedFlags = Pick<
	Conversation["data"],
	"muted" | "pinned" | "favorite" | "rightNow" | "hasUnreadThrob"
>;

export function flagsOf(data: Conversation["data"]): OmittedFlags {
	const { muted, pinned, favorite, rightNow, hasUnreadThrob } = data;
	return { muted, pinned, favorite, rightNow, hasUnreadThrob };
}

export class RememberedConversationFlags {
	#byConversation = new Map<string, OmittedFlags>();
	#seeded = new WeakSet<Conversation>();

	applyTo(entries: Conversation[]): Conversation[] {
		for (const entry of entries) {
			const { conversationId } = entry.data;
			if (
				entry.type === "partial_conversation_v1" &&
				!this.#seeded.has(entry)
			) {
				this.#seeded.add(entry);
				const known = this.#byConversation.get(conversationId);
				if (known) Object.assign(entry.data, known);
			}
			this.#byConversation.set(conversationId, flagsOf(entry.data));
		}
		return entries;
	}
}
