import {
	accountEpoch,
	isAccountEpochCurrent,
} from "#lib/api/account-caches.ts";
import { showErrorToast } from "#lib/api/error-toast.ts";
import { deepEqual } from "#lib/util/deep-equal.ts";
import {
	getPreferences,
	type Preferences,
	setPreferences,
} from "./preferences.svelte";

type FiltersKey = "gridSearchFilters" | "rightNowFeedFilters";

type Filters<Key extends FiltersKey> = NonNullable<Preferences[Key]>;

export class PersistedFiltersState<Key extends FiltersKey> {
	value: Filters<Key> | null = $state(null);
	readonly ready: Promise<void>;

	readonly #key: Key;
	readonly #defaults: Filters<Key>;
	readonly #labels: { load: string; save: string };
	readonly #onQueryChange: () => void;
	#epoch = accountEpoch();

	constructor({
		key,
		defaults,
		labels,
		onQueryChange,
	}: {
		key: Key;
		defaults: Filters<Key>;
		labels: { load: string; save: string };
		onQueryChange: () => void;
	}) {
		this.#key = key;
		this.#defaults = defaults;
		this.#labels = labels;
		this.#onQueryChange = onQueryChange;
		this.ready = this.#load();
	}

	get current(): Filters<Key> {
		return this.value ?? this.#defaults;
	}

	snapshot(): Filters<Key> {
		return { ...this.current };
	}

	set(filters: Partial<Filters<Key>>) {
		const newValue = { ...this.snapshot(), ...filters };
		if (deepEqual(this.value, newValue)) return;
		this.value = newValue;
		void this.save();
		this.#onQueryChange();
	}

	resetFilters() {
		this.set(this.#defaults);
	}

	reset() {
		this.#epoch = accountEpoch();
		this.value = { ...this.#defaults };
	}

	protected async save() {
		const value = this.value;
		if (!isAccountEpochCurrent(this.#epoch) || value === null) return;
		const preferences: Partial<Preferences> = {};
		preferences[this.#key] = value;
		try {
			await setPreferences(preferences);
		} catch (error) {
			console.error(error);
			showErrorToast({ label: this.#labels.save, error });
		}
	}

	async #load() {
		try {
			const stored = (await getPreferences())[this.#key];
			if (this.value === null) this.value = stored ?? this.#defaults;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: this.#labels.load, error });
		}
	}
}
