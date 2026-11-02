import {
	accountEpoch,
	isAccountEpochCurrent,
} from "#lib/api/account-caches.ts";
import { showErrorToast } from "#lib/api/error-toast.ts";
import {
	getPreferences,
	setPreferences,
} from "#lib/app-data/preferences.svelte.ts";
import {
	defaultRightNowFeedFilters,
	type RightNowFeedFilters,
} from "#lib/model/right-now/filters.ts";
import { deepEqual } from "#lib/util/deep-equal.ts";

export class RightNowFeedFiltersState {
	value: RightNowFeedFilters | null = $state(null);
	ready: Promise<void>;

	readonly #onQueryChange: () => void;
	readonly #epoch = accountEpoch();

	constructor({ onQueryChange }: { onQueryChange: () => void }) {
		this.#onQueryChange = onQueryChange;
		this.ready = this.#load();
	}

	snapshot(): RightNowFeedFilters {
		return { ...(this.value ?? defaultRightNowFeedFilters) };
	}

	set(filters: Partial<RightNowFeedFilters>) {
		const newValue = { ...this.snapshot(), ...filters };
		if (deepEqual(this.value, newValue)) return;
		this.value = newValue;
		void this.#save();
		this.#onQueryChange();
	}

	resetFilters() {
		this.set(defaultRightNowFeedFilters);
	}

	async #load() {
		try {
			const { rightNowFeedFilters } = await getPreferences();
			if (this.value === null)
				this.value = rightNowFeedFilters ?? defaultRightNowFeedFilters;
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to load Right Now filters",
				error,
			});
		}
	}

	async #save() {
		if (!isAccountEpochCurrent(this.#epoch) || this.value === null) return;
		try {
			await setPreferences({ rightNowFeedFilters: this.value });
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to update Right Now filters",
				error,
			});
		}
	}
}
