import { lastViewedMarker } from "$lib/util/last-viewed";
import type { Conversation } from "$lib/model/messaging/conversations";

export const inboxLastViewed = lastViewedMarker("chat:inbox-last-viewed:");

export class InboxViewedMarker {
	lastViewedAt = $state(0);
	#profileId: number;
	#lastMarkedVisibleActivity = 0;

	constructor({ profileId }: { profileId: number }) {
		this.#profileId = profileId;
		this.lastViewedAt = inboxLastViewed.load(profileId);
	}

	markViewed(): void {
		const now = Date.now();
		if (now <= this.lastViewedAt) return;
		this.lastViewedAt = now;
		inboxLastViewed.save({ profileId: this.#profileId, at: now });
	}

	hasUnreadAmong(entries: Conversation[]): boolean {
		return entries.some(
			(entry) =>
				entry.data.unreadCount > 0 &&
				!entry.data.muted &&
				entry.data.lastActivityTimestamp > this.lastViewedAt,
		);
	}

	noteVisibleActivity(visible: Conversation[]): void {
		const latest = visible.reduce(
			(max, entry) => Math.max(max, entry.data.lastActivityTimestamp),
			0,
		);
		if (latest === this.#lastMarkedVisibleActivity) return;
		const increased = latest > this.#lastMarkedVisibleActivity;
		this.#lastMarkedVisibleActivity = latest;
		if (increased) this.markViewed();
	}
}
