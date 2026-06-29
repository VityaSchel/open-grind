import { isEqual } from "lodash-es";

import { showErrorToast } from "$lib/api/error";
import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	defaultFilters,
	type GridSearchFilters,
} from "$lib/components/filters/filters";

export class GridSearchFiltersState {
	value: GridSearchFilters | null = $state(null);
	onRefresh: () => void;
	ready: Promise<void>;

	constructor({ onRefresh }: { onRefresh: () => void }) {
		this.onRefresh = onRefresh;
		this.ready = this.#load();
	}

	set(gridSearchFilters: Partial<GridSearchFilters>) {
		const oldValue = this.value;
		const newValue = Object.assign({}, oldValue, gridSearchFilters);
		if (!isEqual(oldValue, newValue)) {
			this.value = newValue;
			void this.#save();
			this.onRefresh();
		}
	}

	resetFilters() {
		this.value = { ...defaultFilters };
		void this.#save();
	}

	async #load() {
		try {
			const { gridSearchFilters } = await getPreferences();
			this.value = gridSearchFilters ?? defaultFilters;
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to load filters",
				error,
			});
		}
	}

	async #save() {
		try {
			if (this.value !== null) {
				await setPreferences({ gridSearchFilters: this.value });
			}
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to update filters",
				error,
			});
		}
	}
}
