import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { Tribe } from "$lib/model/users/profiles";
import { optionFilters } from "./option-filters";

afterEach(async () => {
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("option filters", () => {
	it("offers only the tribes the grid can filter by", () => {
		expect(optionFilters.tribes.table[Tribe.Bear]).toBe("Bear");
		expect(optionFilters.tribes.table).not.toHaveProperty(
			String(Tribe.Trans),
		);
	});

	it("labels tribes in the active locale", async () => {
		await setLocale({ locale: "en-XA" });
		expect(optionFilters.tribes.table[Tribe.Bear]).toBe("⟦Ɓéáŕ ö⟧");
	});
});
