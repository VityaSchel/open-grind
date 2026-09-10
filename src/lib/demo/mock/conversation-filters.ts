import type { InboxFilterRequest } from "$lib/api/messaging/conversations";
import type { Conversation } from "$lib/model/messaging/conversations";

export function isTierGatedFilter(
	filters: Partial<InboxFilterRequest>,
): boolean {
	return Boolean(
		filters.onlineNowOnly ||
		filters.positions?.length ||
		(filters.distanceMeters ?? null) !== null,
	);
}

export function matchesInboxFilters({
	entry,
	filters,
}: {
	entry: Conversation;
	filters: Partial<InboxFilterRequest>;
}): boolean {
	const { data } = entry;
	const participant = data.participants[0];
	if (filters.favoritesOnly && !data.favorite) return false;
	if (filters.unreadOnly && data.unreadCount === 0) return false;
	if (filters.onlineNowOnly && !data.onlineUntil) return false;
	if (filters.rightNowOnly && data.rightNow === "NOT_ACTIVE") return false;
	if (filters.chemistryOnly && !participant?.hasDatingPotential) return false;
	if (
		(participant?.distanceMetres ?? Infinity) >
		(filters.distanceMeters ?? Infinity)
	) {
		return false;
	}
	if (
		filters.positions?.length &&
		!filters.positions.includes(participant?.position ?? -1)
	) {
		return false;
	}
	return true;
}
