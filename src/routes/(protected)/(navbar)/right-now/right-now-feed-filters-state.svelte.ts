import { PersistedFiltersState } from "#lib/app-data/persisted-filters-state.svelte.ts";
import { defaultRightNowFeedFilters } from "#lib/model/right-now/filters.ts";

export class RightNowFeedFiltersState extends PersistedFiltersState<"rightNowFeedFilters"> {
	constructor({ onQueryChange }: { onQueryChange: () => void }) {
		super({
			key: "rightNowFeedFilters",
			defaults: defaultRightNowFeedFilters,
			labels: {
				load: "Failed to load Right Now filters",
				save: "Failed to update Right Now filters",
			},
			onQueryChange,
		});
	}
}
