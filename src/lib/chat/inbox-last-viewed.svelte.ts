import { lastViewedMarker } from "$lib/util/last-viewed";
import type { Conversation } from "$lib/model/messaging/conversations";

export const inboxLastViewed = lastViewedMarker("chat:inbox-last-viewed:");

export class InboxViewedMarker {
	lastViewedAt = $state(0);
	#profileId: number;

	constructor({ profileId }: { profileId: number }) {
		this.#profileId = profileId;
		this.lastViewedAt = inboxLastViewed.load(profileId);
	}

	#markViewed(at: number): void {
		if (at <= this.lastViewedAt) return;
		this.lastViewedAt = at;
		inboxLastViewed.save({ profileId: this.#profileId, at });
	}

	hasUnreadAmong(entries: Conversation[]): boolean {
		return entries.some(
			(entry) =>
				entry.data.unreadCount > 0 &&
				!entry.data.muted &&
				entry.data.lastActivityTimestamp > this.lastViewedAt,
		);
	}

	noteListViewed(entries: Conversation[]): void {
		this.#markViewed(
			entries.reduce(
				(newest, entry) =>
					Math.max(newest, entry.data.lastActivityTimestamp),
				0,
			),
		);
	}
}
