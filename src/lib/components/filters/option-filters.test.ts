import { afterEach, describe, expect, it } from "vitest";

import { featureFlagsState } from "$lib/api/feature-flags-state.svelte";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { Tribe } from "$lib/model/users/profiles";
import { optionFilters } from "./option-filters";

afterEach(async () => {
	featureFlagsState.keys = [];
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("option filters", () => {
	it("withholds the Trans tribe only while the gender filter flag is on", () => {
		expect(optionFilters.tribes.table[Tribe.Trans]).toBe("Trans");
		expect(optionFilters.tribes.isOffered(Tribe.Trans)).toBe(true);

		featureFlagsState.keys = ["gender-filter"];

		expect(optionFilters.tribes.isOffered(Tribe.Trans)).toBe(false);
		expect(optionFilters.tribes.isOffered(Tribe.Bear)).toBe(true);
	});

	it("labels tribes in the active locale", async () => {
		await setLocale({ locale: "en-XA" });
		expect(optionFilters.tribes.table[Tribe.Bear]).toBe("⟦Ɓéáŕ ö⟧");
	});
});
