import { accountScoped } from "$lib/api/account-caches";
import { markBlockedProfilesUnviewable } from "$lib/api/browse/blocks";
import { getReceivedTaps } from "$lib/api/interest/taps";
import {
	isProfileViewable,
	onProfileViewabilityChange,
} from "$lib/api/users/profile-viewability";
import { tapsLastViewed } from "$lib/interest/taps-last-viewed";
import { ReconcilingListState } from "$lib/util/reconciling-list-state.svelte";
import { tapV1TapSentEventSchema, ws } from "$lib/ws.svelte";
import type { TapProfile } from "$lib/model/interest/tap-profile";

const PAGE_SIZE = 20;

type TapsSnapshot = { profiles: TapProfile[] };

export class TapsState extends ReconcilingListState<TapProfile, TapsSnapshot> {
	readonly ourProfileId: number;

	#all: TapProfile[] = $state([]);
	#lastViewedAt = $state(0);
	#tappedSinceViewed = $state(false);
	#newestTapAt = $derived(
		this.#all.reduce((newest, tap) => Math.max(newest, tap.timestamp), 0),
	);
	#unsubscribeViewability = onProfileViewabilityChange(
		({ profileId, viewable }) => {
			if (viewable) {
				void this.refresh();
				return;
			}
			this.#all = this.#all.filter((tap) => tap.profileId !== profileId);
		},
	);

	constructor({ ourProfileId }: { ourProfileId: number }) {
		super({
			pageSize: PAGE_SIZE,
			refreshErrorLabel: "Failed to refresh taps",
		});
		this.ourProfileId = ourProfileId;
		this.#lastViewedAt = tapsLastViewed.load(ourProfileId);
		this.start();
	}

	get taps(): TapProfile[] {
		return this.#all.slice(0, this.visibleCount);
	}

	get hasUnseen(): boolean {
		return (
			this.#tappedSinceViewed || this.#newestTapAt > this.#lastViewedAt
		);
	}

	markViewed(): void {
		this.#tappedSinceViewed = false;
		if (this.#newestTapAt <= this.#lastViewedAt) return;
		this.#lastViewedAt = this.#newestTapAt;
		tapsLastViewed.save({
			profileId: this.ourProfileId,
			at: this.#lastViewedAt,
		});
	}

	protected get length(): number {
		return this.#all.length;
	}

	protected fetch(): Promise<TapsSnapshot> {
		void markBlockedProfilesUnviewable().catch(console.error);
		return getReceivedTaps();
	}

	protected applySnapshotReturningCoveredKeys(
		snapshot: TapsSnapshot,
	): Set<number> {
		this.#all = snapshot.profiles.filter((tap) =>
			isProfileViewable(tap.profileId),
		);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- caller only reads .has() then drops it
		return new Set(snapshot.profiles.map((tap) => tap.profileId));
	}

	protected applyUpsert(tap: TapProfile): void {
		if (!isProfileViewable(tap.profileId)) return;
		const existing = this.#all.findIndex(
			(t) => t.profileId === tap.profileId,
		);
		if (existing !== -1) this.#all.splice(existing, 1);
		this.#all = [tap, ...this.#all];
		this.#tappedSinceViewed = true;
	}

	protected keyOf(tap: TapProfile): number {
		return tap.profileId;
	}

	override destroy(): void {
		this.#unsubscribeViewability();
		super.destroy();
	}

	protected subscribeEvents(): Promise<() => void> {
		return ws.on("tap.v1.tap_sent", tapV1TapSentEventSchema, (event) => {
			const tap = event.payload;
			if (tap.recipientId !== this.ourProfileId) return;
			this.upsert({
				distance: null,
				profileImageMediaHash: tap.senderProfileImageHash,
				isFavorite: false,
				profileId: tap.senderId,
				displayName: tap.senderDisplayName,
				timestamp: tap.timestamp,
				tapType: tap.tapType,
				lastOnline: tap.timestamp,
				isBoosting: false,
				isMutual: tap.isMutual,
				rightNowType: "",
				isViewable: true,
			});
		});
	}
}

export const getTapsState = accountScoped(
	(ourProfileId) => new TapsState({ ourProfileId }),
);
