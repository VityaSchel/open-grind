import { untrack } from "svelte";

import {
	accountEpoch,
	accountScoped,
	isAccountEpochCurrent,
} from "#lib/api/account-caches.ts";
import { appLifecycle } from "#lib/api/app-lifecycle.svelte.ts";
import { markBlockedAndHiddenProfilesUnviewable } from "#lib/api/browse/unviewable-profiles.ts";
import {
	getRightNowFeed,
	rightNowFeedVersion,
} from "#lib/api/right-now/feed.ts";
import {
	isProfileViewable,
	onProfileViewabilityChange,
} from "#lib/api/users/profile-viewability.ts";
import { onProfileEdit } from "#lib/api/users/profiles.ts";
import { getPreferences } from "#lib/app-data/preferences.svelte.ts";
import { atHomeLocation } from "#lib/entitlements/honduras-hold.ts";
import { storeLocation } from "#lib/grid/grid.ts";
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

export type RightNowFeedPost = Exclude<
	RightNowFeedResponseItem,
	{ type: "curated_post_v1" | "upsell_insert_v1" }
>;

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

function keysOf(posts: RightNowFeedPost[]): Set<number> {
	return new Set(posts.map((post) => post.data.id));
}

class SignedOutBeforeFeedRequest extends Error {}

export class RightNowFeedState extends ReconcilingListState<
	RightNowFeedPost,
	RightNowFeedResponse
> {
	readonly filters = new RightNowFeedFiltersState({
		onQueryChange: () => this.#startOver(),
	});

	#entries: RightNowFeedPost[] = $state.raw([]);
	#fetchStartedAt = 0;
	#poll: ReturnType<typeof setInterval> | null = null;
	#startOverListeners: (() => void)[] = [];
	#fetchedGeohash: string | null = null;
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
				(post) => authorOf(post) !== profileId,
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

	get entries(): RightNowFeedPost[] {
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

	followLocation(geohash: string): void {
		if (this.#fetchedGeohash === null || this.#fetchedGeohash === geohash)
			return;
		this.#fetchedGeohash = geohash;
		untrack(() => this.#startOver());
	}

	onStartOver(listener: () => void): () => void {
		this.#startOverListeners = [...this.#startOverListeners, listener];
		return () => {
			this.#startOverListeners = this.#startOverListeners.filter(
				(existing) => existing !== listener,
			);
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
		markBlockedAndHiddenProfilesUnviewable();
		await this.filters.ready;
		const version = await rightNowFeedVersion();
		const query = rightNowFeedQuery(this.filters.snapshot());
		return atHomeLocation(async () => {
			if (!isAccountEpochCurrent(epoch))
				throw new SignedOutBeforeFeedRequest();
			const { geohash } = await getPreferences();
			this.#fetchedGeohash = geohash;
			if (geohash !== null) await storeLocation({ geohash });
			return getRightNowFeed({ version, query });
		});
	}

	protected applySnapshotReturningCoveredKeys(
		snapshot: RightNowFeedResponse,
	): Set<number> {
		this.#entries = snapshot.items
			.filter(
				(item) =>
					item.type !== "curated_post_v1" &&
					item.type !== "upsell_insert_v1",
			)
			.filter((post) => {
				const author = authorOf(post);
				return author === null || isProfileViewable(author);
			});
		return keysOf(this.#entries);
	}

	protected applyUpsert(): void {}

	protected keyOf(post: RightNowFeedPost): number {
		return post.data.id;
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
		untrack(() => {
			for (const listener of this.#startOverListeners) listener();
		});
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
		this.#entries = this.#entries.map((post) => {
			if (!isAuthored(post) || post.data.profileId !== profileId)
				return post;
			return { ...post, data: { ...post.data, favorite } };
		});
	}
}

export const getRightNowFeedState = accountScoped(
	() => new RightNowFeedState(),
);
