import type { InboxFilterRequest } from "$lib/api/messaging/conversations";
import type { Conversation } from "$lib/model/messaging/conversations";

export const CONVERSATION_FILTER_KEYS = ["favorites"] as const;

export type ConversationFilterKey = (typeof CONVERSATION_FILTER_KEYS)[number];

export function inboxFilterRequest(
	active: ConversationFilterKey[],
): InboxFilterRequest | null {
	if (active.length === 0) return null;
	return {
		unreadOnly: false,
		chemistryOnly: false,
		favoritesOnly: active.includes("favorites"),
		rightNowOnly: false,
		onlineNowOnly: false,
		distanceMeters: null,
		positions: [],
	};
}

export class ConversationFilters {
	active = $state<ConversationFilterKey[]>([]);

	set(active: ConversationFilterKey[]): boolean {
		const unchanged =
			active.length === this.active.length &&
			active.every((key) => this.active.includes(key));
		if (unchanged) return false;
		this.active = active;
		return true;
	}
}

export function applyFavoriteEdit({
	entries,
	profileId,
	isFavorite,
}: {
	entries: Conversation[];
	profileId: number;
	isFavorite: boolean;
}): void {
	const entry = entries.find(
		(candidate) => candidate.data.participants[0]?.profileId === profileId,
	);
	if (entry) entry.data.favorite = isFavorite;
}
