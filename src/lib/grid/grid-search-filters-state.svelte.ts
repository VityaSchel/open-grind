import { showErrorToast } from "$lib/api/error-toast";
import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	defaultFilters,
	type GridSearchFilters,
} from "$lib/model/browse/grid/filters";
import { deepEqual } from "$lib/util/deep-equal";

export class GridSearchFiltersState {
	value: GridSearchFilters | null = $state(null);
	onQueryChange: () => void;
	ready: Promise<void>;

	constructor({ onQueryChange }: { onQueryChange: () => void }) {
		this.onQueryChange = onQueryChange;
		this.ready = this.#load();
	}

	snapshot(): GridSearchFilters {
		return { ...(this.value ?? defaultFilters) };
	}

	set(gridSearchFilters: Partial<GridSearchFilters>) {
		const oldValue = this.value;
		const newValue = Object.assign({}, oldValue, gridSearchFilters);
		if (!deepEqual(oldValue, newValue)) {
			this.value = newValue;
			void this.#save();
			this.onQueryChange();
		}
	}

	resetFilters() {
		this.value = { ...defaultFilters };
		void this.#save();
	}

	reset() {
		this.value = { ...defaultFilters };
	}

	async #load() {
		try {
			const { gridSearchFilters } = await getPreferences();
			this.value = gridSearchFilters ?? defaultFilters;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to load filters", error });
		}
	}

	async #save() {
		try {
			if (this.value !== null) {
				await setPreferences({ gridSearchFilters: this.value });
			}
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to update filters", error });
		}
	}
}
