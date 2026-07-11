import { untrack } from "svelte";
import z from "zod";

import { registerAccountCache } from "$lib/api/account-caches";
import { showErrorToast } from "$lib/api/error";
import type { cascadeV4QuerySchema } from "$lib/model/browse/grid/cascade/query/v4";
import {
	getCachedProfile,
	getGrid,
	type GridProfile,
	resolveLazyProfile,
	setCachedProfile,
} from "./grid";
import { GridSearchFiltersState } from "./grid-search-filters-state.svelte";

class GridState {
	filters = new GridSearchFiltersState({ onRefresh: () => this.refresh() });
	items: GridProfile[] = $state([]);
	nextPage: number | null = $state(0);
	loadingMore = $state(false);
	loading = $state(false);
	refreshing = $state(false);
	error: Error | null = $state(null);

	get errorMessage(): string | null {
		return this.error?.message ?? null;
	}
	currentQuery: z.infer<typeof cascadeV4QuerySchema> | null = null;
	scrollY = 0;

	#geohash: string | null = null;
	#resolvingIds = new Set<number>();
	#fetchToken = 0;

	load(geohash: string): void {
		if (untrack(() => this.#geohash === geohash && this.items.length > 0))
			return;
		this.#geohash = geohash;
		this.#reset();
		this.scrollY = 0;
		void this.#fetchProfiles(geohash);
	}

	refresh(): void {
		if (!this.#geohash) return;
		this.#reset();
		this.scrollY = 0;
		void this.#fetchProfiles(this.#geohash);
	}

	async reload(): Promise<void> {
		if (!this.#geohash || this.refreshing) return;
		this.refreshing = true;
		try {
			await this.#fetchProfiles(this.#geohash, { silent: true });
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
		this.filters.reset();
	}

	async loadMore(): Promise<void> {
		if (this.loadingMore || !this.nextPage || !this.currentQuery) return;
		this.loadingMore = true;
		const token = this.#fetchToken;
		try {
			const result = await getGrid({
				...this.currentQuery,
				pageNumber: this.nextPage,
			});
			if (token !== this.#fetchToken) return;
			this.items.push(...result.items);
			this.nextPage = result.nextPage;
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to load more profiles",
				error,
			});
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
				if (idx !== -1) this.items[idx] = cached;
				return;
			}

			const resolved = await resolveLazyProfile(item);
			if (token !== this.#fetchToken) return;
			const idx = this.items.findIndex((i) => i.id === id);
			if (idx === -1) return;
			if (resolved) {
				setCachedProfile(resolved);
				this.items[idx] = resolved;
			} else {
				this.items.splice(idx, 1);
			}
		} catch (error) {
			console.error(id, error);
			showErrorToast({
				label: "Failed to load profile",
				error,
			});
		} finally {
			this.#resolvingIds.delete(id);
		}
	}

	async #fetchProfiles(
		geohash: string,
		opts?: { silent?: boolean },
	): Promise<void> {
		const token = ++this.#fetchToken;
		try {
			await this.filters.ready;
			if (token !== this.#fetchToken) return;
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
				...(filters?.genderEnabled && {
					genders: filters?.genders,
				}),
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
				...(filters?.tribesEnabled && {
					tribes: filters?.tribes,
				}),
				...(filters?.bodyTypesEnabled && {
					bodyTypes: filters?.bodyTypes,
				}),
				...(filters?.heightEnabled && {
					heightCmMin: filters?.height[0],
					heightCmMax: filters?.height[1],
				}),
				...(filters?.weightEnabled && {
					weightGramsMin: filters?.weight[0] * 1000,
					weightGramsMax: filters?.weight[1] * 1000,
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
				...(filters?.meetAtEnabled && {
					meetAt: filters?.meetAt,
				}),
				notRecentlyChatted: filters?.haventChattedTodayEnabled || undefined,
				...(filters?.healthPracticesEnabled && {
					sexualHealth: filters?.healthPractices,
				}),
				...(filters?.tagsEnabled &&
					filters?.tags && {
						tags: filters?.tags,
					}),
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
			if (opts?.silent) {
				showErrorToast({
					label: "Failed to refresh profiles",
					error: err,
				});
			} else {
				this.error =
					err instanceof Error
						? err
						: new Error("Failed to fetch profiles", { cause: err });
			}
			this.loading = false;
		}
	}
}

export const gridState = new GridState();

registerAccountCache(() => gridState.reset());
