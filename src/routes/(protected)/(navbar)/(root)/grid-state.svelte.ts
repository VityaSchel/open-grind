import { untrack } from "svelte";
import z from "zod";

import { showErrorToast } from "$lib/api/error";
import { getPreferences } from "$lib/app-data/preferences.svelte";
import type { cascadeV3QuerySchema } from "$lib/model/grid/cascade/query/v3";
import {
	getGrid,
	type GridProfile,
	profileCache,
	resolvePartialBatch,
} from "./grid";

class GridState {
	items = $state<GridProfile[]>([]);
	partialBatches: { batch: { profileId: number }[] }[] = [];
	nextPage = $state<number | null>(0);
	loadingMore = $state(false);
	loading = $state(false);
	refreshing = $state(false);
	error = $state<Error | null>(null);

	get errorMessage(): string | null {
		return this.error?.message ?? null;
	}
	currentQuery: z.infer<typeof cascadeV3QuerySchema> | null = null;
	scrollY = 0;

	#geohash: string | null = null;
	#loadingBatches = new Set<number>();

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
				const cached = profileCache.get(id);
				if (cached) {
					const idx = this.items.findIndex((i) => i.id === id);
					if (idx !== -1) this.items[idx] = cached;
				} else {
					uncachedIds.push(id);
				}
			}

			const resolved = await resolvePartialBatch(uncachedIds);
			for (const profile of resolved) {
				profileCache.set(profile.id, profile);
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
		try {
			const { gridSearchFilters } = await getPreferences();
			const query = {
				nearbyGeoHash: geohash,
				favorites: gridSearchFilters?.isFavorite || undefined,
				onlineOnly: gridSearchFilters?.isOnline || undefined,
				rightNow: gridSearchFilters?.isRightNow || undefined,
				...(gridSearchFilters?.ageEnabled && {
					ageMin: gridSearchFilters?.age[0],
					ageMax: gridSearchFilters?.age[1],
				}),
				...(gridSearchFilters?.genderEnabled && {
					genders: gridSearchFilters?.genders,
				}),
				...(gridSearchFilters?.positionEnabled && {
					sexualPositions: gridSearchFilters?.positions,
				}),
				...(gridSearchFilters?.photosEnabled &&
					gridSearchFilters?.photos.includes("has-photos") && {
						photoOnly: true,
					}),
				...(gridSearchFilters?.photosEnabled &&
					gridSearchFilters?.photos.includes("has-albums") && {
						hasAlbum: true,
					}),
				...(gridSearchFilters?.photosEnabled &&
					gridSearchFilters?.photos.includes("has-face-pics") && {
						faceOnly: true,
					}),
				...(gridSearchFilters?.tribesEnabled && {
					tribes: gridSearchFilters?.tribes,
				}),
				...(gridSearchFilters?.bodyTypesEnabled && {
					bodyTypes: gridSearchFilters?.bodyTypes,
				}),
				...(gridSearchFilters?.heightEnabled && {
					heightCmMin: gridSearchFilters?.height[0],
					heightCmMax: gridSearchFilters?.height[1],
				}),
				...(gridSearchFilters?.weightEnabled && {
					weightGramsMin: gridSearchFilters?.weight[0] * 1000,
					weightGramsMax: gridSearchFilters?.weight[1] * 1000,
				}),
				...(gridSearchFilters?.relationshipStatusesEnabled && {
					relationshipStatuses: gridSearchFilters?.relationshipStatuses,
				}),
				...(gridSearchFilters?.acceptNSFWPicsEnabled &&
					gridSearchFilters?.acceptNSFWPics !== undefined && {
						nsfwPics: gridSearchFilters?.acceptNSFWPics,
					}),
				...(gridSearchFilters?.lookingForEnabled && {
					lookingFor: gridSearchFilters?.lookingFor,
				}),
				...(gridSearchFilters?.meetAtEnabled && {
					meetAt: gridSearchFilters?.meetAt,
				}),
				notRecentlyChatted:
					gridSearchFilters?.haventChattedTodayEnabled || undefined,
				...(gridSearchFilters?.healthPracticesEnabled && {
					sexualHealth: gridSearchFilters?.healthPractices,
				}),
				...(gridSearchFilters?.tagsEnabled && gridSearchFilters?.tags && {
					tags: gridSearchFilters?.tags,
				}),
				fresh: gridSearchFilters?.isFresh || undefined,
			} satisfies z.infer<typeof cascadeV3QuerySchema>;
			this.currentQuery = query;
			const result = await getGrid(query);
			this.#loadingBatches.clear();
			this.items = result.items;
			this.partialBatches = result.partialBatches;
			this.nextPage = result.nextPage;
			this.error = null;
			this.loading = false;
		} catch (err) {
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
