import { accountScoped } from "$lib/api/account-caches";
import { markBlockedProfilesUnviewable } from "$lib/api/browse/blocks";
import { markHiddenProfilesUnviewable } from "$lib/api/browse/hides";
import { getViews } from "$lib/api/interest/views";
import {
	isProfileViewable,
	onProfileViewabilityChange,
} from "$lib/api/users/profile-viewability";
import { onProfileEdit } from "$lib/api/users/profiles";
import { ReconcilingListState } from "$lib/util/reconciling-list-state.svelte";
import { viewedMeV1NewViewReceivedEventSchema, ws } from "$lib/ws.svelte";
import type { ViewerProfile, ViewPreview } from "$lib/model/interest/views";

const PAGE_SIZE = 24;

type ViewsSnapshot = { profiles: ViewerProfile[]; previews: ViewPreview[] };

export type ViewGridEntry =
	| { type: "profile"; key: string; profile: ViewerProfile }
	| { type: "preview"; key: string; preview: ViewPreview };

export class ViewsState extends ReconcilingListState<
	ViewerProfile,
	ViewsSnapshot
> {
	#profiles: ViewerProfile[] = $state([]);
	#previews: ViewPreview[] = $state([]);
	#unsubscribeProfileEdits = onProfileEdit(({ profileId, patch }) => {
		if (patch.isFavorite === undefined) return;
		this.setFavorite({ profileId, isFavorite: patch.isFavorite });
	});
	#unsubscribeViewability = onProfileViewabilityChange(
		({ profileId, viewable }) => {
			if (viewable) {
				void this.refresh();
				return;
			}
			this.#profiles = this.#profiles.filter(
				(view) => view.profileId !== profileId,
			);
		},
	);

	constructor() {
		super({
			pageSize: PAGE_SIZE,
			refreshErrorLabel: "Failed to refresh views",
		});
		this.start();
	}

	setFavorite({
		profileId,
		isFavorite,
	}: {
		profileId: number;
		isFavorite: boolean;
	}): void {
		const index = this.#profiles.findIndex(
			(v) => v.profileId === profileId,
		);
		const profile = this.#profiles[index];
		if (!profile) return;
		this.#profiles = this.#profiles.with(index, { ...profile, isFavorite });
	}

	get views(): ViewGridEntry[] {
		const entries: ViewGridEntry[] = [
			...this.#profiles.map(
				(profile): ViewGridEntry => ({
					type: "profile",
					key: `profile:${profile.profileId}`,
					profile,
				}),
			),
			...this.#previews.map(
				(preview, index): ViewGridEntry => ({
					type: "preview",
					key: `preview:${index}`,
					preview,
				}),
			),
		];
		return entries.slice(0, this.visibleCount);
	}

	protected get length(): number {
		return this.#profiles.length + this.#previews.length;
	}

	protected fetch(): Promise<ViewsSnapshot> {
		void markBlockedProfilesUnviewable().catch((error) =>
			console.error(error),
		);
		void markHiddenProfilesUnviewable().catch((error) =>
			console.error(error),
		);
		return getViews();
	}

	protected applySnapshotReturningCoveredKeys(
		snapshot: ViewsSnapshot,
	): Set<number> {
		this.#profiles = snapshot.profiles.filter((view) =>
			isProfileViewable(view.profileId),
		);
		this.#previews = snapshot.previews;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- caller only reads .has() then drops it
		return new Set(snapshot.profiles.map((profile) => profile.profileId));
	}

	protected applyUpsert(fresh: ViewerProfile): void {
		if (!isProfileViewable(fresh.profileId)) return;
		const index = this.#profiles.findIndex(
			(v) => v.profileId === fresh.profileId,
		);
		const prev = this.#profiles[index];
		let next = fresh;
		if (prev) {
			this.#profiles.splice(index, 1);
			next = {
				...prev,
				...fresh,
				displayName: fresh.displayName ?? prev.displayName,
				profileImageMediaHash:
					fresh.profileImageMediaHash ?? prev.profileImageMediaHash,
				distance: fresh.distance ?? prev.distance,
				onlineUntil: fresh.onlineUntil ?? prev.onlineUntil,
				isFavorite: prev.isFavorite,
				viewedCount: {
					...prev.viewedCount,
					totalCount: prev.viewedCount.totalCount + 1,
				},
			};
		}
		this.#profiles = [next, ...this.#profiles];
	}

	protected keyOf(view: ViewerProfile): number {
		return view.profileId;
	}

	override destroy(): void {
		this.#unsubscribeProfileEdits();
		this.#unsubscribeViewability();
		super.destroy();
	}

	protected subscribeEvents(): Promise<() => void> {
		return ws.on(
			"viewed_me.v1.new_view_received",
			viewedMeV1NewViewReceivedEventSchema,
			(event) => {
				const recent = event.payload.mostRecent;
				if (!recent) return;
				this.upsert({
					profileId: recent.profileId,
					displayName: null,
					profileImageMediaHash: recent.photoHash ?? null,
					distance: null,
					onlineUntil: null,
					lastViewed: recent.timestamp,
					isSecretAdmirer: false,
					isFavorite: false,
					viewedCount: { totalCount: 1, maxDisplayCount: 99 },
				});
			},
		);
	}
}

export const getViewsState = accountScoped(() => new ViewsState());
