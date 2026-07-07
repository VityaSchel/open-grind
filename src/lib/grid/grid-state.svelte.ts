import { untrack } from "svelte";
import z from "zod";

import { showErrorToast } from "$lib/api/error";
import type { cascadeV3QuerySchema } from "$lib/model/grid/cascade/query/v3";
import {
	getCachedProfile,
	getGrid,
	type GridProfile,
	resolvePartialBatch,
	setCachedProfile,
} from "./grid";
import { GridSearchFiltersState } from "./grid-search-filters-state.svelte";

class GridState {
	filters = new GridSearchFiltersState({ onRefresh: () => this.refresh() });
	items: GridProfile[] = $state([]);
	partialBatches: { batch: { profileId: number }[] }[] = [];
	nextPage: number | null = $state(0);
	loadingMore = $state(false);
	loading = $state(false);
	refreshing = $state(false);
	error: Error | null = $state(null);

	get errorMessage(): string | null {
		return this.error?.message ?? null;
	}
	currentQuery: z.infer<typeof cascadeV3QuerySchema> | null = null;
	scrollY = 0;

	#geohash: string | null = null;
	#loadingBatches = new Set<number>();
	#fetchToken = 0;

	load(geohash: string): void {
		if (untrack(() => this.#geohash === geohash && this.items.length > 0))
			return;
		this.#geohash = geohash;
		this.#reset();
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
		this.partialBatches = [];
		this.nextPage = 0;
		this.loadingMore = false;
		this.loading = true;
		this.error = null;
		this.currentQuery = null;
		this.#loadingBatches.clear();
	}

	async loadMore(): Promise<void> {
		if (this.loadingMore || !this.nextPage || !this.currentQuery) return;
		this.loadingMore = true;
		try {
			const batchOffset = this.partialBatches.length;
			const result = await getGrid({
				...this.currentQuery,
				pageNumber: this.nextPage,
			});
			for (const item of result.items) {
				this.items.push(
					item.type === "partial"
						? { ...item, batchIndex: item.batchIndex + batchOffset }
						: item,
				);
			}
			this.partialBatches.push(...result.partialBatches);
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

	async loadBatch(batchIndex: number): Promise<void> {
		if (this.#loadingBatches.has(batchIndex)) return;
		this.#loadingBatches.add(batchIndex);
		try {
			const batch = this.partialBatches[batchIndex];
			if (!batch) return;
			const profileIds = batch.batch.map((p) => p.profileId);
			const uncachedIds: number[] = [];

			for (const id of profileIds) {
				const cached = getCachedProfile(id);
				if (cached) {
					const idx = this.items.findIndex((i) => i.id === id);
					if (idx !== -1) this.items[idx] = cached;
				} else {
					uncachedIds.push(id);
				}
			}

			const resolved = await resolvePartialBatch(uncachedIds);
			for (const profile of resolved) {
				setCachedProfile(profile);
				const idx = this.items.findIndex((i) => i.id === profile.id);
				if (idx !== -1) this.items[idx] = profile;
			}

			const unresolved = uncachedIds.filter(
				(id) => !resolved.some((profile) => profile.id === id),
			);
			for (const id of unresolved) {
				const idx = this.items.findIndex((i) => i.id === id);
				if (idx !== -1) this.items.splice(idx, 1);
			}
		} catch (error) {
			console.error(batchIndex, error);
			showErrorToast({
				label: "Failed to load profiles",
				error,
			});
			this.#loadingBatches.delete(batchIndex);
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
			} satisfies z.infer<typeof cascadeV3QuerySchema>;
			const result = await getGrid(query);
			if (token !== this.#fetchToken) return;
			this.currentQuery = query;
			this.#loadingBatches.clear();
			this.items = result.items;
			this.partialBatches = result.partialBatches;
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
