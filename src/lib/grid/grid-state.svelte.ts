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
import { reconciler } from "$lib/util/reconcile";
import type { cascadeV4QuerySchema } from "$lib/model/browse/grid/cascade/query/v4";
import {
	getCachedProfile,
	getGrid,
	type GridProfile,
	patchCachedProfile,
	resolveLazyProfile,
	setCachedProfile,
} from "./grid";
import { buildCascadeQuery } from "./grid-query";
import { GridSearchFiltersState } from "./grid-search-filters-state.svelte";

class GridState {
	filters = new GridSearchFiltersState({ onQueryChange: () => this.retry() });
	items: GridProfile[] = $state.raw([]);
	nextPage: number | null = $state(0);
	loadingMore = $state(false);
	loading = $state(false);
	refreshing = $state(false);
	error: Error | null = $state(null);
	viewActive = false;

	get errorMessage(): string | null {
		return this.error?.message ?? null;
	}
	currentQuery: z.infer<typeof cascadeV4QuerySchema> | null = null;
	scrollY = 0;

	#geohash: string | null = null;
	#retargeted: string | null = null;
	#resolvingIds = new Set<number>();
	#firstPageIds = new Set<number>();
	#fetchToken = 0;

	setFavorite({
		profileId,
		isFavorite,
	}: {
		profileId: number;
		isFavorite: boolean;
	}): void {
		patchCachedProfile({ id: profileId, patch: { isFavorite } });
		const index = this.items.findIndex((item) => item.id === profileId);
		const item = this.items[index];
		if (!item || item.type !== "rendered") return;
		this.items = this.items.with(index, { ...item, isFavorite });
	}

	removeProfile(profileId: number): void {
		const index = this.items.findIndex((item) => item.id === profileId);
		if (index === -1) return;
		this.items = this.items.toSpliced(index, 1);
	}

	load(geohash: string): void {
		if (untrack(() => this.#retargeted === geohash)) return;
		if (untrack(() => this.#geohash === geohash && this.items.length > 0))
			return;
		this.#geohash = geohash;
		this.#reset();
		this.scrollY = 0;
		void this.#fetchProfiles(geohash);
	}

	retry(): void {
		if (!this.#geohash) return;
		this.#reset();
		this.scrollY = 0;
		void this.#fetchProfiles(this.#geohash);
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
		this.loadingMore = false;
		this.loading = true;
		this.error = null;
		this.currentQuery = null;
		this.#resolvingIds.clear();
		this.#firstPageIds.clear();
	}

	reset(): void {
		this.#fetchToken += 1;
		this.#reset();
		this.loading = false;
		this.refreshing = false;
		this.scrollY = 0;
		this.#geohash = null;
		this.#retargeted = null;
		this.filters.reset();
	}

	async loadMore(): Promise<void> {
		if (this.loadingMore || !this.nextPage || !this.currentQuery) return;
		this.loadingMore = true;
		const token = this.#fetchToken;
		const query = this.currentQuery;
		try {
			const result = await getGrid({
				...query,
				pageNumber: this.nextPage,
			});
			if (token !== this.#fetchToken || query !== this.currentQuery)
				return;
			const loadedIds = new Set(this.items.map((item) => item.id));
			this.items = [
				...this.items,
				...result.items.filter((item) => !loadedIds.has(item.id)),
			];
			this.nextPage = result.nextPage;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to load more profiles", error });
		} finally {
			this.loadingMore = false;
		}
	}

	async resolveProfile(id: number): Promise<void> {
		if (this.#resolvingIds.has(id)) return;
		this.#resolvingIds.add(id);
		const token = this.#fetchToken;
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
			if (token !== this.#fetchToken) return;
			const idx = this.items.findIndex((i) => i.id === id);
			if (idx === -1) return;
			if (resolved) {
				setCachedProfile(resolved);
				this.items = this.items.with(idx, resolved);
			} else {
				this.items = this.items.toSpliced(idx, 1);
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
		token: number,
		background: boolean,
	): Promise<string> {
		const resolved = await autoLocation.resolveGeohash(geohash, {
			background,
		});
		if (token !== this.#fetchToken || resolved === geohash) return geohash;
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
		const token = ++this.#fetchToken;
		this.#retargeted = null;
		try {
			await this.filters.ready;
			if (token !== this.#fetchToken) return;
			const geohash =
				(opts?.sampleLocation ?? true)
					? await this.#withLiveLocation(
							requestedGeohash,
							token,
							opts?.background ?? false,
						)
					: requestedGeohash;
			if (token !== this.#fetchToken) return;
			const query = buildCascadeQuery({
				geohash,
				filters: this.filters.value,
			});
			const result = await getGrid(query);
			if (token !== this.#fetchToken) return;
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
			this.error = null;
			this.loading = false;
		} catch (err) {
			if (token !== this.#fetchToken) return;
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
