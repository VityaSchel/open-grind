import {
	type ConversationFilterValues,
	defaultConversationFilters,
} from "$lib/model/messaging/conversation-filters";
import { deepEqual } from "$lib/util/deep-equal";
import type { InboxFilterRequest } from "$lib/api/messaging/conversations";
import type { Conversation } from "$lib/model/messaging/conversations";

export function inboxFilterRequest(
	values: ConversationFilterValues,
): InboxFilterRequest | null {
	if (deepEqual(values, defaultConversationFilters)) return null;
	return {
		unreadOnly: values.unread,
		chemistryOnly: false,
		favoritesOnly: values.favorites,
		rightNowOnly: values.rightNow,
		onlineNowOnly: values.online,
		distanceMeters: values.distanceMetres,
		positions: [...values.positions],
	};
}

export class ConversationFilters {
	value = $state<ConversationFilterValues>({ ...defaultConversationFilters });

	get request(): InboxFilterRequest | null {
		return inboxFilterRequest(this.value);
	}

	get filtered(): boolean {
		return this.request !== null;
	}

	set(values: Partial<ConversationFilterValues>): boolean {
		const merged = { ...this.value, ...values };
		if (deepEqual(this.value, merged)) return false;
		this.value = merged;
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
