import { showErrorToast } from "$lib/api/error-toast";
import { getTags } from "$lib/api/users/tags";
import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	defaultFilters,
	type GridSearchFilters,
	tagCatalog,
} from "$lib/model/browse/grid/filters";
import { withDeadline } from "$lib/util/deadline";
import { deepEqual } from "$lib/util/deep-equal";

const TAG_LOOKUP_DEADLINE_MS = 5_000;

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
		this.set(defaultFilters);
	}

	reset() {
		this.value = { ...defaultFilters };
	}

	async resolveTagKeys(): Promise<void> {
		try {
			await this.#replaceTagTexts();
		} catch (error) {
			console.error(error);
		}
	}

	async #replaceTagTexts() {
		if (!this.value?.tagsEnabled || this.value.tags.length === 0) return;
		const tags = [...this.value.tags];
		const languages = await withDeadline({
			work: getTags,
			ms: TAG_LOOKUP_DEADLINE_MS,
		});
		const keys = tagCatalog({ languages }).keysOf(tags);
		if (!this.value || !deepEqual(this.value.tags, tags)) return;
		if (deepEqual(keys, tags)) return;
		this.value = { ...this.value, tags: keys };
		void this.#save();
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
