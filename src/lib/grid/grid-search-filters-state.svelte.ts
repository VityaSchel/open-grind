import { getTags } from "#lib/api/users/tags.ts";
import { PersistedFiltersState } from "#lib/app-data/persisted-filters-state.svelte.ts";
import { defaultFilters, tagCatalog } from "#lib/model/browse/grid/filters.ts";
import { withDeadline } from "#lib/util/deadline.ts";
import { deepEqual } from "#lib/util/deep-equal.ts";

const TAG_LOOKUP_DEADLINE_MS = 5_000;

export class GridSearchFiltersState extends PersistedFiltersState<"gridSearchFilters"> {
	constructor({ onQueryChange }: { onQueryChange: () => void }) {
		super({
			key: "gridSearchFilters",
			defaults: defaultFilters,
			labels: {
				load: "Failed to load filters",
				save: "Failed to update filters",
			},
			onQueryChange,
		});
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
		void this.save();
	}
}
