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
import { staysOnline } from "#lib/presence/presence-gate.ts";
import { now } from "#lib/util/clock.ts";
import { Generation } from "#lib/util/generation.ts";
import { getNow } from "#lib/util/now.ts";
import { ReconcilingListState } from "#lib/util/reconciling-list-state.svelte.ts";
import { TOP_SLOP_PX } from "#lib/util/scroll.ts";
import type {
	RightNowFeedResponse,
	RightNowFeedResponseItem,
} from "#lib/model/right-now/feed.ts";
import { rightNowFeedQuery } from "./feed-query";
import { RightNowFeedFiltersState } from "./right-now-feed-filters-state.svelte";
import { atStoredLocation } from "./stored-location";

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

function shownPostsOf(snapshot: RightNowFeedResponse): RightNowFeedPost[] {
	return snapshot.items
		.filter(
			(item) =>
				item.type !== "curated_post_v1" &&
				item.type !== "upsell_insert_v1",
		)
		.filter((post) => {
			const author = authorOf(post);
			return author === null || isProfileViewable(author);
		});
}

export class RightNowFeedState extends ReconcilingListState<
	RightNowFeedPost,
	RightNowFeedResponse
> {
	readonly filters = new RightNowFeedFiltersState({
		onQueryChange: () => this.#startOver(),
	});

	hasNewPosts = $state(false);

	#entries: RightNowFeedPost[] = $state.raw([]);
	readonly #shownLists = new Generation();
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
		return this.#unexpired.slice(0, this.visibleCount);
	}

	get #atTop(): boolean {
		return this.scrollY <= TOP_SLOP_PX;
	}

	get #unexpired(): RightNowFeedPost[] {
		const current = getNow();
		return this.#entries.filter((post) => post.data.expiration > current);
	}

	override attachView(): () => void {
		const detach = super.attachView();
		this.#stopPolling();
		this.#poll = setInterval(() => this.#pollTick(), POLL_TICK_MS);
		untrack(() => {
			if (!this.loading && !this.refreshing && this.#pollDue())
				void this.refreshOrDefer({ attended: true });
		});
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

	followScroll(scrollY: number): void {
		const wasAtTop = this.#atTop;
		this.scrollY = scrollY;
		const arrivedAtTop = !wasAtTop && this.#atTop;
		if (
			arrivedAtTop &&
			this.hasNewPosts &&
			!this.loading &&
			!this.refreshing
		)
			void this.refreshOrDefer({ attended: false });
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
		return this.#unexpired.length;
	}

	protected fetch(): Promise<RightNowFeedResponse> {
		return this.#request({
			epoch: accountEpoch(),
			onGeohash: (geohash) => {
				this.#fetchedGeohash = geohash;
			},
		});
	}

	protected applySnapshotReturningCoveredKeys(
		snapshot: RightNowFeedResponse,
	): Set<number> {
		this.#show(shownPostsOf(snapshot));
		return keysOf(this.#entries);
	}

	protected applyUpsert(): void {}

	protected keyOf(post: RightNowFeedPost): number {
		return post.data.id;
	}

	protected subscribeEvents(): Promise<() => void> {
		return Promise.resolve(() => {});
	}

	async #request({
		epoch,
		onGeohash,
	}: {
		epoch: number;
		onGeohash: (geohash: string | null) => void;
	}): Promise<RightNowFeedResponse> {
		this.#fetchStartedAt = now();
		markBlockedAndHiddenProfilesUnviewable();
		await this.filters.ready;
		const version = await rightNowFeedVersion();
		const query = rightNowFeedQuery(this.filters.snapshot());
		return atStoredLocation({
			epoch,
			onGeohash,
			request: () => getRightNowFeed({ version, query }),
		});
	}

	#pollDue(): boolean {
		return (
			now() - this.#fetchStartedAt >= POLL_INTERVAL_MS - POLL_TICK_MS / 2
		);
	}

	#pollTick(): void {
		if (document.hidden || !appLifecycle.active) return;
		if (this.loading || this.refreshing || !this.#pollDue()) return;
		if (!staysOnline() || this.length === 0 || this.#atTop) {
			void this.refreshOrDefer({ attended: false });
			return;
		}
		if (!this.hasNewPosts) void this.#checkForNewPosts();
	}

	async #checkForNewPosts(): Promise<void> {
		const epoch = accountEpoch();
		const shownList = this.#shownLists.current;
		const checked: { geohash?: string | null } = {};
		let latest: RightNowFeedResponse;
		try {
			latest = await this.#request({
				epoch,
				onGeohash: (geohash) => {
					checked.geohash = geohash;
				},
			});
		} catch (error) {
			if (isAccountEpochCurrent(epoch)) console.error(error);
			return;
		}
		if (
			this.#shownLists.isStale(shownList) ||
			checked.geohash !== this.#fetchedGeohash
		)
			return;
		const shown = keysOf(this.#entries);
		if (!shownPostsOf(latest).some((post) => !shown.has(post.data.id)))
			return;
		if (this.#atTop) void this.refreshOrDefer({ attended: false });
		else this.hasNewPosts = true;
	}

	#show(posts: RightNowFeedPost[]): void {
		this.#shownLists.next();
		this.hasNewPosts = false;
		this.#entries = posts;
	}

	#startOver(): void {
		this.#show([]);
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
