import {
	accountEpoch,
	accountScoped,
	isAccountEpochCurrent,
} from "#lib/api/account-caches.ts";
import { appLifecycle } from "#lib/api/app-lifecycle.svelte.ts";
import { markBlockedProfilesUnviewable } from "#lib/api/browse/blocks.ts";
import { markHiddenProfilesUnviewable } from "#lib/api/browse/hides.ts";
import {
	getRightNowFeed,
	rightNowFeedVersion,
} from "#lib/api/right-now/feed.ts";
import {
	isProfileViewable,
	onProfileViewabilityChange,
} from "#lib/api/users/profile-viewability.ts";
import { onProfileEdit } from "#lib/api/users/profiles.ts";
import { atHomeLocation } from "#lib/entitlements/honduras-hold.ts";
import { now } from "#lib/util/clock.ts";
import { ReconcilingListState } from "#lib/util/reconciling-list-state.svelte.ts";
import type {
	RightNowFeedResponse,
	RightNowFeedResponseItem,
} from "#lib/model/right-now/feed.ts";
import { rightNowFeedQuery } from "./feed-query";
import { RightNowFeedFiltersState } from "./right-now-feed-filters-state.svelte";

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 2 * 60_000;
const POLL_TICK_MS = 15_000;

export type RightNowFeedEntry = { key: string; item: RightNowFeedResponseItem };

type AuthoredItem = Extract<
	RightNowFeedResponseItem,
	{ type: "right_now_post_v3" | "locked_post_v1" }
>;

function isAuthored(item: RightNowFeedResponseItem): item is AuthoredItem {
	return item.type === "right_now_post_v3" || item.type === "locked_post_v1";
}

function authorOf(item: RightNowFeedResponseItem): number | null {
	return isAuthored(item) ? item.data.profileId : null;
}

function entriesOf(items: RightNowFeedResponseItem[]): RightNowFeedEntry[] {
	return items.map((item, index) => ({
		key:
			"id" in item.data
				? `post-${item.data.id}`
				: `${item.type}-${index}`,
		item,
	}));
}

function keysOf(entries: RightNowFeedEntry[]): Set<string> {
	return new Set(entries.map(({ key }) => key));
}

class SignedOutBeforeFeedRequest extends Error {}

export class RightNowFeedState extends ReconcilingListState<
	RightNowFeedEntry,
	RightNowFeedResponse,
	string
> {
	readonly filters = new RightNowFeedFiltersState({
		onQueryChange: () => this.#startOver(),
	});

	#entries: RightNowFeedEntry[] = $state.raw([]);
	#fetchStartedAt = 0;
	#poll: ReturnType<typeof setInterval> | null = null;
	#unsubscribeProfileEdits = onProfileEdit(({ profileId, patch }) => {
		if (patch.isFavorite === undefined) return;
		this.#setFavorite({ profileId, favorite: patch.isFavorite });
	});
	#unsubscribeViewability = onProfileViewabilityChange(
		({ profileId, viewable }) => {
			if (viewable) {
				void this.refreshOrDefer({ attended: false });
				return;
			}
			this.#entries = this.#entries.filter(
				({ item }) => authorOf(item) !== profileId,
			);
		},
	);

	constructor() {
		super({
			pageSize: PAGE_SIZE,
			refreshErrorLabel: "Failed to refresh Right Now",
			marksOnline: true,
		});
		this.start();
	}

	get entries(): RightNowFeedEntry[] {
		return this.#entries.slice(0, this.visibleCount);
	}

	override attachView(): () => void {
		const detach = super.attachView();
		this.#stopPolling();
		this.#poll = setInterval(() => this.#pollTick(), POLL_TICK_MS);
		return () => {
			detach();
			if (!this.viewActive) this.#stopPolling();
		};
	}

	override destroy(): void {
		this.#stopPolling();
		this.#unsubscribeProfileEdits();
		this.#unsubscribeViewability();
		super.destroy();
	}

	protected get length(): number {
		return this.#entries.length;
	}

	protected async fetch(): Promise<RightNowFeedResponse> {
		const epoch = accountEpoch();
		this.#fetchStartedAt = now();
		void markBlockedProfilesUnviewable().catch((error) =>
			console.error(error),
		);
		void markHiddenProfilesUnviewable().catch((error) =>
			console.error(error),
		);
		await this.filters.ready;
		const version = await rightNowFeedVersion();
		const query = rightNowFeedQuery(this.filters.snapshot());
		return atHomeLocation(() => {
			if (!isAccountEpochCurrent(epoch))
				throw new SignedOutBeforeFeedRequest();
			return getRightNowFeed({ version, query });
		});
	}

	protected applySnapshotReturningCoveredKeys(
		snapshot: RightNowFeedResponse,
	): Set<string> {
		this.#entries = entriesOf(
			snapshot.items.filter((item) => {
				if (item.type === "curated_post_v1") return false;
				if (item.type === "upsell_insert_v1") return false;
				const author = authorOf(item);
				return author === null || isProfileViewable(author);
			}),
		);
		return keysOf(this.#entries);
	}

	protected applyUpsert(): void {}

	protected keyOf(entry: RightNowFeedEntry): string {
		return entry.key;
	}

	protected subscribeEvents(): Promise<() => void> {
		return Promise.resolve(() => {});
	}

	#pollTick(): void {
		if (document.hidden || !appLifecycle.active) return;
		if (now() - this.#fetchStartedAt < POLL_INTERVAL_MS - POLL_TICK_MS / 2)
			return;
		void this.refreshOrDefer({ attended: false });
	}

	#startOver(): void {
		this.#entries = [];
		this.visibleCount = PAGE_SIZE;
		this.scrollY = 0;
		this.retry();
	}

	#stopPolling(): void {
		if (this.#poll !== null) clearInterval(this.#poll);
		this.#poll = null;
	}

	#setFavorite({
		profileId,
		favorite,
	}: {
		profileId: number;
		favorite: boolean;
	}): void {
		this.#entries = this.#entries.map((entry) => {
			const { item } = entry;
			if (!isAuthored(item) || item.data.profileId !== profileId)
				return entry;
			return {
				...entry,
				item: { ...item, data: { ...item.data, favorite } },
			};
		});
	}
}

export const getRightNowFeedState = accountScoped(
	() => new RightNowFeedState(),
);
