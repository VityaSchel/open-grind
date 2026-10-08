import { untrack } from "svelte";
import type z from "zod";

import { registerAccountCache } from "$lib/api/account-caches";
import { showErrorToast } from "$lib/api/error-toast";
import { onProfileViewabilityChange } from "$lib/api/users/profile-viewability";
import { onProfileEdit } from "$lib/api/users/profiles";
import {
	preferencesSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import { autoLocation } from "$lib/location/auto-location";
import { Generation } from "$lib/util/generation";
import { reconciler } from "$lib/util/reconcile";
import { SentinelPaging } from "$lib/util/sentinel-paging.svelte";
import type { cascadeV4QuerySchema } from "$lib/model/browse/grid/cascade/query/v4";
import {
	getCachedProfile,
	getGrid,
	type GridProfile,
	patchCachedProfile,
	resolveLazyProfile,
	setCachedProfile,
} from "./grid";
import { dedupeGridProfiles, indexProfilesById } from "./grid-profiles";
import { buildCascadeQuery } from "./grid-query";
import { GridSearchFiltersState } from "./grid-search-filters-state.svelte";

class GridState {
	filters = new GridSearchFiltersState({ onQueryChange: () => this.retry() });
	items: GridProfile[] = $state.raw([]);
	readonly profiles: GridProfile[] = $derived(dedupeGridProfiles(this.items));
	nextPage: number | null = $state(0);
	readonly paging = new SentinelPaging({
		loadPage: (page) => this.#loadPage(page),
		cursor: () => this.nextPage || null,
	});
	loading = $state(false);
	refreshing = $state(false);
	error: Error | null = $state(null);
	viewActive = false;

	get errorMessage(): string | null {
		return this.error?.message ?? null;
	}
	currentQuery: z.infer<typeof cascadeV4QuerySchema> | null = null;
	scrollY = 0;
	revealProfileId: number | null = null;

	#geohash: string | null = null;
	#retargeted: string | null = null;
	#resolvingIds = new Set<number>();
	#firstPageIds = new Set<number>();
	#generation = new Generation();
	#startOverListeners = new Set<() => void>();
	#indexById = $derived(indexProfilesById(this.profiles));

	indexInProfiles(profileId: number): number {
		return this.#indexById.get(profileId) ?? -1;
	}

	profileById(profileId: number): GridProfile | null {
		return this.profiles[this.indexInProfiles(profileId)] ?? null;
	}

	consumeReveal(): number | null {
		const profileId = this.revealProfileId;
		this.revealProfileId = null;
		return profileId;
	}

	setFavorite({
		profileId,
		isFavorite,
	}: {
		profileId: number;
		isFavorite: boolean;
	}): void {
		patchCachedProfile({ id: profileId, patch: { isFavorite } });
		if (this.profileById(profileId)?.type !== "rendered") return;
		this.items = this.items.map((item) =>
			item.id === profileId && item.type === "rendered"
				? { ...item, isFavorite }
				: item,
		);
	}

	removeProfile(profileId: number): void {
		if (this.indexInProfiles(profileId) === -1) return;
		this.items = this.items.filter((item) => item.id !== profileId);
	}

	onStartOver(listener: () => void): () => void {
		this.#startOverListeners.add(listener);
		return () => {
			this.#startOverListeners.delete(listener);
		};
	}

	load(geohash: string): void {
		if (untrack(() => this.#retargeted === geohash)) return;
		if (untrack(() => this.#geohash === geohash && this.items.length > 0))
			return;
		this.#geohash = geohash;
		this.#startOver(geohash);
	}

	retry(): void {
		if (!this.#geohash) return;
		this.#startOver(this.#geohash);
	}

	#startOver(geohash: string): void {
		this.#reset();
		this.scrollY = 0;
		untrack(() => {
			for (const listener of this.#startOverListeners) listener();
		});
		void this.#fetchProfiles(geohash);
	}

	async refresh({
		background = false,
		keepLoadedPages = true,
	} = {}): Promise<void> {
		const geohash = this.#geohash ?? preferencesSnapshot().geohash;
		if (!geohash || this.refreshing) return;
		this.#geohash = geohash;
		this.refreshing = true;
		try {
			await this.#fetchProfiles(geohash, {
				silent: true,
				background,
				sampleLocation: !background || this.viewActive,
				keepLoadedPages,
			});
		} finally {
			this.refreshing = false;
		}
	}

	#reset(): void {
		this.items = [];
		this.nextPage = 0;
		this.loading = true;
		this.error = null;
		this.currentQuery = null;
		this.revealProfileId = null;
		this.#resolvingIds.clear();
		this.#firstPageIds.clear();
	}

	reset(): void {
		this.#generation.next();
		this.#reset();
		this.loading = false;
		this.refreshing = false;
		this.scrollY = 0;
		this.#geohash = null;
		this.#retargeted = null;
		this.filters.reset();
	}

	async #loadPage(page: number): Promise<void> {
		const generation = this.#generation.current;
		const query = this.currentQuery;
		if (query === null) return;
		const isCurrent = () =>
			!this.#generation.isStale(generation) &&
			query === this.currentQuery;
		const result = await getGrid({ ...query, pageNumber: page }).catch(
			(error: unknown) => {
				if (isCurrent()) throw error;
				return null;
			},
		);
		if (result === null || !isCurrent()) return;
		const loadedIds = new Set(this.items.map((item) => item.id));
		this.items = [
			...this.items,
			...result.items.filter((item) => !loadedIds.has(item.id)),
		];
		this.nextPage = result.nextPage;
	}

	async resolveProfile(id: number): Promise<void> {
		if (this.#resolvingIds.has(id)) return;
		this.#resolvingIds.add(id);
		const generation = this.#generation.current;
		try {
			const item = this.items.find((i) => i.id === id);
			if (!item || item.type !== "lazy") return;

			const cached = getCachedProfile(id);
			if (cached) {
				const idx = this.items.findIndex((i) => i.id === id);
				if (idx !== -1) this.items = this.items.with(idx, cached);
				return;
			}

			const resolved = await resolveLazyProfile(item);
			if (this.#generation.isStale(generation)) return;
			const idx = this.items.findIndex((i) => i.id === id);
			if (idx === -1) return;
			if (resolved) {
				setCachedProfile(resolved);
				this.items = this.items.with(idx, resolved);
			} else {
				this.removeProfile(id);
			}
		} catch (error) {
			console.error(id, error);
			showErrorToast({ label: "Failed to load profile", error });
		} finally {
			this.#resolvingIds.delete(id);
		}
	}

	async #withLiveLocation(
		geohash: string,
		generation: number,
		background: boolean,
	): Promise<string> {
		const resolved = await autoLocation.resolveGeohash(geohash, {
			background,
		});
		if (this.#generation.isStale(generation) || resolved === geohash)
			return geohash;
		this.#geohash = resolved;
		this.#retargeted = resolved;
		setPreferences({ geohash: resolved }).catch((error: unknown) =>
			console.error(error),
		);
		return resolved;
	}

	async #fetchProfiles(
		requestedGeohash: string,
		opts?: {
			silent?: boolean;
			background?: boolean;
			sampleLocation?: boolean;
			keepLoadedPages?: boolean;
		},
	): Promise<void> {
		const generation = this.#generation.next();
		this.#retargeted = null;
		try {
			await this.filters.ready;
			if (this.#generation.isStale(generation)) return;
			const [geohash] = await Promise.all([
				(opts?.sampleLocation ?? true)
					? this.#withLiveLocation(
							requestedGeohash,
							generation,
							opts?.background ?? false,
						)
					: requestedGeohash,
				this.filters.resolveTagKeys(),
			]);
			if (this.#generation.isStale(generation)) return;
			const query = buildCascadeQuery({
				geohash,
				filters: this.filters.value,
			});
			const result = await getGrid(query);
			if (this.#generation.isStale(generation)) return;
			this.currentQuery = query;
			this.#resolvingIds.clear();
			const firstPageIds = new Set(result.items.map((item) => item.id));
			const laterPages =
				opts?.keepLoadedPages && geohash === requestedGeohash
					? this.items.filter(
							(item) =>
								!this.#firstPageIds.has(item.id) &&
								!firstPageIds.has(item.id),
						)
					: [];
			this.#firstPageIds = firstPageIds;
			this.items = [...result.items, ...laterPages];
			if (laterPages.length === 0) this.nextPage = result.nextPage;
			this.paging.rearm();
			this.error = null;
			this.loading = false;
		} catch (err) {
			if (this.#generation.isStale(generation)) return;
			console.error(err);
			this.loading = false;
			if (opts?.background) return;
			if (opts?.silent) {
				showErrorToast({
					label: "Failed to refresh profiles",
					error: err,
					onRetry: () =>
						void this.refresh({
							keepLoadedPages: opts.keepLoadedPages,
						}),
				});
				return;
			}
			this.error =
				err instanceof Error
					? err
					: new Error("Failed to fetch profiles", { cause: err });
		}
	}
}

export const gridState = new GridState();

registerAccountCache({ reset: () => gridState.reset() });
reconciler.subscribe(() => gridState.refresh());
onProfileEdit(({ profileId, patch }) => {
	if (patch.isFavorite === undefined) return;
	gridState.setFavorite({ profileId, isFavorite: patch.isFavorite });
});
onProfileViewabilityChange(({ profileId, viewable }) => {
	if (viewable) void gridState.refresh();
	else gridState.removeProfile(profileId);
});
