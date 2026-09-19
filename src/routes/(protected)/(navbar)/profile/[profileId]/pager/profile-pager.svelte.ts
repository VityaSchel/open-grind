import { SvelteMap, SvelteSet } from "svelte/reactivity";

import { registerAccountCache } from "$lib/api/account-caches";
import {
	isProfileViewable,
	onProfileViewabilityChange,
} from "$lib/api/users/profile-viewability";
import { browseOrder } from "$lib/grid/grid-profiles";
import type { RenderedGridProfile } from "$lib/grid/grid";
import type { gridState } from "$lib/grid/grid-state.svelte";
import { type FetchedProfile, ProfileState } from "../profile-state.svelte";
import { recordProfileVisit } from "../record-visit";

const TRACK_REACH = 100;
const TRACK_END_MARGIN = 5;
const LOAD_AHEAD_REMAINING = 6;

export type ProfilePagerSource = Pick<
	typeof gridState,
	| "profiles"
	| "indexInProfiles"
	| "profileById"
	| "revealProfileId"
	| "nextPage"
	| "loadMore"
>;

export type ProfilePagerEntry = {
	profileId: number;
	ourProfileId: number;
	origin: "browse" | null;
};

export type ProfilePagerReset = ProfilePagerEntry & {
	historyTraversal: boolean;
};

export type MountedProfile = {
	position: number;
	profileId: number;
	state: ProfileState;
};

const viewedProfileIds = new SvelteSet<number>();

registerAccountCache({ reset: () => viewedProfileIds.clear() });

export class ProfilePagerModel {
	#order: number[] = $state.raw([]);
	#trackStart = $state(0);
	#trackEnd = $state(0);
	#activePosition = $state(0);
	#generation = $state(0);

	readonly track: number[] = $derived(
		this.#order.slice(this.#trackStart, this.#trackEnd),
	);
	readonly activeId: number | undefined = $derived(
		this.track[this.#activePosition],
	);

	readonly #source: ProfilePagerSource;
	readonly #rows = new SvelteMap<number, RenderedGridProfile>();
	readonly #states = new SvelteMap<number, ProfileState>();
	readonly #withdrawn = new SvelteSet<number>();
	readonly #fetched = new SvelteMap<number, FetchedProfile>();
	readonly #issued = new SvelteSet<number>();
	readonly #stopFollowingViewability: () => void;
	#ourProfileId = 0;
	#browsing = false;
	#visibleFirst = 0;
	#visibleLast = 0;

	readonly mounted: MountedProfile[] = $derived(
		[...this.#states]
			.sort(([left], [right]) => left - right)
			.map(([position, state]) => ({
				position,
				profileId: state.profileId,
				state,
			})),
	);

	constructor({
		source,
		...entry
	}: { source: ProfilePagerSource } & ProfilePagerReset) {
		this.#source = source;
		this.#stopFollowingViewability = onProfileViewabilityChange(
			({ profileId, viewable }) => {
				this.#fetched.delete(profileId);
				if (viewable) this.#withdrawn.delete(profileId);
				else this.#withdrawn.add(profileId);
			},
		);
		this.reset(entry);
	}

	get activePosition(): number {
		return this.#activePosition;
	}

	get generation(): number {
		return this.#generation;
	}

	reset({
		profileId,
		ourProfileId,
		origin,
		historyTraversal,
	}: ProfilePagerReset): void {
		for (const state of this.#states.values()) state.destroy();
		this.#states.clear();
		this.#fetched.clear();
		this.#issued.clear();
		this.#withdrawn.clear();
		if (!historyTraversal) viewedProfileIds.clear();

		const { order, rows, entryIndex } = browseOrder({
			profiles: origin === "browse" ? this.#source.profiles : [],
			entryId: profileId,
			excludeId: ourProfileId,
		});
		this.#ourProfileId = ourProfileId;
		this.#browsing = rows.size > 0;
		this.#order = order;
		this.#rows.clear();
		for (const [id, row] of rows) this.#rows.set(id, row);
		this.#trackStart = Math.max(0, entryIndex - TRACK_REACH);
		this.#trackEnd = Math.min(order.length, entryIndex + TRACK_REACH + 1);
		this.#activePosition = entryIndex - this.#trackStart;
		this.#visibleFirst = this.#activePosition;
		this.#visibleLast = this.#activePosition;
		this.#withdrawUnviewable(order);

		this.#syncStates();
		this.#states.get(this.#activePosition)?.activate();
		this.#visit(profileId);
		if (!historyTraversal) this.#source.revealProfileId = null;
		this.#loadAhead();
		this.#generation += 1;
	}

	needsReset({
		profileId,
		ourProfileId,
		origin,
	}: ProfilePagerEntry): boolean {
		if (ourProfileId !== this.#ourProfileId) return true;
		if (profileId === this.activeId) return false;
		return origin !== "browse" || !this.#issued.has(profileId);
	}

	role(position: number): "active" | "neighbor" {
		return position === this.#activePosition ? "active" : "neighbor";
	}

	row(profileId: number): RenderedGridProfile | null {
		const entered = this.#rows.get(profileId);
		if (!entered) return null;
		const live = this.#source.profileById(profileId);
		return live?.type === "rendered" ? live : entered;
	}

	heroHash(profileId: number): string | null {
		if (this.#withdrawn.has(profileId)) return null;
		return this.row(profileId)?.profilePhotosHashes?.[0] ?? null;
	}

	setVisiblePositions({
		first,
		last,
	}: {
		first: number;
		last: number;
	}): void {
		if (first === this.#visibleFirst && last === this.#visibleLast) return;
		this.#visibleFirst = first;
		this.#visibleLast = last;
		this.#extendTrack();
		this.#syncStates();
	}

	commit({ position }: { position: number }): number | null {
		const profileId = this.track[position];
		if (profileId === undefined || position === this.#activePosition)
			return null;
		this.#states.get(this.#activePosition)?.deactivate();
		this.#activePosition = position;
		this.#extendTrack();
		this.#syncStates();
		const landed = this.#states.get(position);
		landed?.revalidate();
		landed?.activate();
		this.#issued.add(profileId);
		this.#visit(profileId);
		this.#source.revealProfileId = profileId;
		this.#loadAhead();
		return profileId;
	}

	absorbGridGrowth(): void {
		if (!this.#browsing) return;
		const lastListed = this.#order.findLast(
			(profileId) => this.#source.indexInProfiles(profileId) !== -1,
		);
		if (lastListed === undefined) return;
		const appended = this.#source.profiles
			.slice(this.#source.indexInProfiles(lastListed) + 1)
			.filter(
				(profile): profile is RenderedGridProfile =>
					profile.type === "rendered" &&
					profile.id !== this.#ourProfileId &&
					!this.#rows.has(profile.id),
			);
		if (appended.length === 0) return;
		const appendedIds = appended.map((profile) => profile.id);
		this.#order = [...this.#order, ...appendedIds];
		for (const profile of appended) this.#rows.set(profile.id, profile);
		this.#withdrawUnviewable(appendedIds);
		this.#extendTrack();
		this.#syncStates();
	}

	destroy(): void {
		this.#stopFollowingViewability();
		for (const state of this.#states.values()) state.destroy();
	}

	#extendTrack(): void {
		const furthest = Math.max(this.#activePosition, this.#visibleLast);
		if (furthest < this.track.length - TRACK_END_MARGIN) return;
		this.#trackEnd = Math.min(
			this.#order.length,
			this.#trackEnd + TRACK_REACH,
		);
	}

	#windowPositions(): number[] {
		const from = Math.max(0, this.#visibleFirst - 1);
		const to = Math.min(this.track.length - 1, this.#visibleLast + 1);
		const span = Array.from(
			{ length: Math.max(0, to - from + 1) },
			(_, offset) => from + offset,
		);
		return span.includes(this.#activePosition)
			? span
			: [this.#activePosition, ...span];
	}

	#syncStates(): void {
		const positions = this.#windowPositions();
		for (const [position, state] of this.#states) {
			if (positions.includes(position)) continue;
			const { profileId, profile, note, refreshing } = state;
			if (profile && !refreshing && !this.#withdrawn.has(profileId))
				this.#fetched.set(profileId, { profile, note });
			else this.#fetched.delete(profileId);
			state.destroy();
			this.#states.delete(position);
		}
		for (const position of positions) {
			const profileId = this.track[position];
			if (profileId === undefined || this.#states.has(position)) continue;
			this.#states.set(
				position,
				new ProfileState({
					profileId,
					ourProfileId: this.#ourProfileId,
					fetched: this.#fetched.get(profileId),
				}),
			);
		}
	}

	#withdrawUnviewable(profileIds: readonly number[]): void {
		for (const profileId of profileIds)
			if (!isProfileViewable(profileId)) this.#withdrawn.add(profileId);
	}

	#visit(profileId: number): void {
		if (viewedProfileIds.has(profileId)) return;
		viewedProfileIds.add(profileId);
		void recordProfileVisit({
			profileId,
			ourProfileId: this.#ourProfileId,
		});
	}

	#loadAhead(): void {
		if (!this.#browsing || !this.#source.nextPage) return;
		const remaining =
			this.#order.length - (this.#trackStart + this.#activePosition) - 1;
		if (remaining < LOAD_AHEAD_REMAINING) void this.#source.loadMore();
	}
}
