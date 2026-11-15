import { PersistedFiltersState } from "#lib/app-data/persisted-filters-state.svelte.ts";
import { defaultRightNowFeedFilters } from "#lib/model/right-now/filters.ts";

export class RightNowFeedFiltersState extends PersistedFiltersState<"rightNowFeedFilters"> {
	constructor({ onQueryChange }: { onQueryChange: () => void }) {
		super({
			key: "rightNowFeedFilters",
			defaults: defaultRightNowFeedFilters,
			labels: {
				load: "browse.rightNow.filters.errors.loadFailed",
				save: "browse.rightNow.filters.errors.updateFailed",
			},
			onQueryChange,
		});
	}
}
