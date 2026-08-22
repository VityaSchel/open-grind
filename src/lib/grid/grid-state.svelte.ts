import { untrack } from "svelte";
import type z from "zod";

import { registerAccountCache } from "$lib/api/account-caches";
import { showErrorToast } from "$lib/api/error-toast";
import { onProfileViewabilityChange } from "$lib/api/users/profile-viewability";
import { onProfileEdit } from "$lib/api/users/profiles";
import {
	getPreferencesSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import { autoLocation } from "$lib/location/auto-location";
import { WEIGHT_KG_MAX, WEIGHT_KG_MIN } from "$lib/model/browse/grid/filters";
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

	async refresh({ background = false } = {}): Promise<void> {
		const geohash = this.#geohash ?? getPreferencesSnapshot().geohash;
		if (!geohash || this.refreshing) return;
		this.#geohash = geohash;
		this.refreshing = true;
		try {
			await this.#fetchProfiles(geohash, {
				silent: true,
				background,
				sampleLocation: !background || this.viewActive,
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
			this.items = [...this.items, ...result.items];
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
		geohash: string,
		opts?: {
			silent?: boolean;
			background?: boolean;
			sampleLocation?: boolean;
		},
	): Promise<void> {
		const token = ++this.#fetchToken;
		this.#retargeted = null;
		try {
			await this.filters.ready;
			if (token !== this.#fetchToken) return;
			if (opts?.sampleLocation ?? true) {
				geohash = await this.#withLiveLocation(
					geohash,
					token,
					opts?.background ?? false,
				);
				if (token !== this.#fetchToken) return;
			}
			const filters = this.filters.value;
			const query = {
				nearbyGeoHash: geohash,
				favorites: filters?.isFavorite || undefined,
				onlineOnly: filters?.isOnline || undefined,
				rightNow: filters?.isRightNow || undefined,
				...(filters?.ageEnabled && {
					ageMin: filters?.age[0],
					ageMax: filters?.age[1],
				}),
				...(filters?.genderEnabled && { genders: filters?.genders }),
				...(filters?.positionEnabled && {
					sexualPositions: filters?.positions,
				}),
				...(filters?.photosEnabled &&
					filters?.photos.includes("has-photos") && {
						photoOnly: true,
					}),
				...(filters?.photosEnabled &&
					filters?.photos.includes("has-albums") && {
						hasAlbum: true,
					}),
				...(filters?.photosEnabled &&
					filters?.photos.includes("has-face-pics") && {
						faceOnly: true,
					}),
				...(filters?.tribesEnabled && { tribes: filters?.tribes }),
				...(filters?.bodyTypesEnabled && {
					bodyTypes: filters?.bodyTypes,
				}),
				...(filters?.heightEnabled && {
					heightCmMin: filters?.height[0],
					heightCmMax: filters?.height[1],
				}),
				...(filters?.weightEnabled && {
					weightGramsMin:
						(filters?.weight[0] ?? WEIGHT_KG_MIN) * 1000,
					weightGramsMax:
						(filters?.weight[1] ?? WEIGHT_KG_MAX) * 1000,
				}),
				...(filters?.relationshipStatusesEnabled && {
					relationshipStatuses: filters?.relationshipStatuses,
				}),
				...(filters?.acceptNSFWPicsEnabled &&
					filters?.acceptNSFWPics !== undefined && {
						nsfwPics: filters?.acceptNSFWPics,
					}),
				...(filters?.lookingForEnabled && {
					lookingFor: filters?.lookingFor,
				}),
				...(filters?.meetAtEnabled && { meetAt: filters?.meetAt }),
				notRecentlyChatted:
					filters?.haventChattedTodayEnabled || undefined,
				...(filters?.healthPracticesEnabled && {
					sexualHealth: filters?.healthPractices,
				}),
				...(filters?.tagsEnabled &&
					filters?.tags && { tags: filters?.tags }),
				fresh: filters?.isFresh || undefined,
			} satisfies z.infer<typeof cascadeV4QuerySchema>;
			const result = await getGrid(query);
			if (token !== this.#fetchToken) return;
			this.currentQuery = query;
			this.#resolvingIds.clear();
			this.items = result.items;
			this.nextPage = result.nextPage;
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
