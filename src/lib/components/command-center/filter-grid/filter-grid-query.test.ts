import { afterEach, describe, expect, it } from "vitest";

import { featureFlagsState } from "$lib/api/feature-flags-state.svelte";
import { sentFilterKeys } from "$lib/grid/grid-query";
import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import {
	defaultFilters,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";
import { filterErrorText } from "./filter-error-text";
import { type ParsedFilter, parseFilterGridQuery } from "./filter-grid-query";

afterEach(async () => {
	await setLocale({ locale: SOURCE_LOCALE });
});

function parsedAt<T>(entries: readonly T[], index: number): T {
	const entry = entries[index];
	if (!entry) throw new Error(`no parsed filter at index ${index}`);
	return entry;
}

function errorTextAt(entries: readonly ParsedFilter[], index: number): string {
	const { error } = parsedAt(entries, index);
	if (!error) throw new Error(`no error at index ${index}`);
	return filterErrorText(error);
}

describe("parseFilterGridQuery", () => {
	it("returns defaults and no badges for an empty query", () => {
		const result = parseFilterGridQuery("?");
		expect(result.parsed).toHaveLength(0);
		expect(result.validCount).toBe(0);
		expect(result.invalidCount).toBe(0);
		expect(result.filters).toEqual(defaultFilters);
	});

	it("parses booleans, ranges and enums into the filters model", () => {
		const result = parseFilterGridQuery(
			"?onlineOnly=true&ageMin=25&ageMax=40&tribes=1,6&weightGramsMin=70000",
		);
		expect(result.invalidCount).toBe(0);
		expect(result.parsed.map((p) => p.key)).toEqual([
			"online",
			"age",
			"tribes",
			"weight",
		]);
		expect(result.filters.isOnline).toBe(true);
		expect(result.filters.ageEnabled).toBe(true);
		expect(result.filters.age).toEqual([25, 40]);
		expect(result.filters.tribesEnabled).toBe(true);
		expect(result.filters.tribes).toEqual([1, 6]);
		expect(result.filters.weightEnabled).toBe(true);
		expect(result.filters.weight).toEqual([70, defaultFilters.weight[1]]);
	});

	it("stores the official weight ends in grams as the slider ends", () => {
		const result = parseFilterGridQuery(
			"?weightGramsMin=40823&weightGramsMax=272156",
		);
		expect(result.filters.weight).toEqual([WEIGHT_KG_MIN, WEIGHT_KG_MAX]);
		expect(
			sentFilterKeys({
				filters: result.filters,
				genderFilterFlag: false,
			}),
		).toEqual([]);
	});

	it("rounds a typed weight in grams to whole kilograms", () => {
		const result = parseFilterGridQuery("?weightGramsMax=80600");
		expect(result.filters.weight).toEqual([WEIGHT_KG_MIN, 81]);
	});

	it("names each filter as the filters UI does", () => {
		const result = parseFilterGridQuery(
			[
				"?online=true&favorites=true&rightNow=true&fresh=true",
				"notRecentlyChatted=true&hasPhotos=true&age=18-30",
				"height=150-200&weight=60-80&position=1&tribes=1&bodyType=1",
				"relationship=1&nsfw=1&lookingFor=1&meetAt=1&health=1",
				"genders=-1&tags=bear",
			].join("&"),
		);
		expect(
			result.parsed.map((filter) => filter.label && t(filter.label)),
		).toEqual([
			"Online",
			"Favorites",
			"Right Now",
			"Fresh",
			"Haven’t Chatted Today",
			"Photos",
			"Age",
			"Height",
			"Weight",
			"Position",
			"Tribes",
			"Body Type",
			"Relationship Status",
			"Accept NSFW Pics",
			"Looking For",
			"Meet At",
			"Health Practices",
			"Gender",
			"Tags",
		]);
	});

	it("words yes and no for boolean filters", () => {
		const result = parseFilterGridQuery("?online=true&favorites=false");
		expect(result.parsed.map((filter) => filter.valueText)).toEqual([
			"Yes",
			"No",
		]);
	});

	it("renders min and max as a single field, matching the filters UI", () => {
		const result = parseFilterGridQuery("?ageMin=25&ageMax=40");
		expect(result.parsed).toHaveLength(1);
		expect(parsedAt(result.parsed, 0).key).toBe("age");
		expect(parsedAt(result.parsed, 0).valueText).toBe("25–40");
	});

	it("supports the combined `age=min-max` syntax with an open bound", () => {
		const result = parseFilterGridQuery("?age=30-");
		expect(result.filters.age).toEqual([30, defaultFilters.age[1]]);
		expect(parsedAt(result.parsed, 0).valueText).toBe("30 years and over");
	});

	it("accepts aliases", () => {
		const result = parseFilterGridQuery("?online=true&position=1,3");
		expect(result.filters.isOnline).toBe(true);
		expect(result.filters.positionEnabled).toBe(true);
		expect(result.filters.positions).toEqual([1, 3]);
		expect(result.parsed.map((p) => p.key)).toEqual(["online", "position"]);
		expect(parsedAt(result.parsed, 1).valueText).toBe("Top, Versatile");
	});

	it("turns Fresh on from fresh=true", () => {
		const result = parseFilterGridQuery("?fresh=true");
		expect(result.invalidCount).toBe(0);
		expect(result.parsed.map((p) => p.key)).toEqual(["fresh"]);
		expect(result.filters.isFresh).toBe(true);
	});

	it("rejects an incomplete combined range without throwing", () => {
		for (const query of ["?age=", "?age=25", "?height=170", "?weight=70"]) {
			const result = parseFilterGridQuery(query);
			expect(result.parsed).toHaveLength(1);
			expect(parsedAt(result.parsed, 0).valid).toBe(false);
			expect(errorTextAt(result.parsed, 0)).toBe(
				"Use min-max, e.g. 25-40",
			);
		}
		expect(parseFilterGridQuery("?age=").filters.ageEnabled).toBe(false);
	});

	it("renders human labels for enum values", () => {
		const result = parseFilterGridQuery("?tribes=1,6");
		expect(parsedAt(result.parsed, 0).valueText).toBe("Bear, Jock");
	});

	it("renders enum labels in the active locale", async () => {
		await setLocale({ locale: "en-XA" });
		const result = parseFilterGridQuery("?tribes=1");
		expect(parsedAt(result.parsed, 0).valueText).toContain("⟦Ɓéáŕ ö⟧");
	});

	it("combines photo flags into a single photos field", () => {
		const result = parseFilterGridQuery("?photoOnly=true&hasAlbum=true");
		expect(result.parsed).toHaveLength(1);
		expect(parsedAt(result.parsed, 0).key).toBe("photos");
		expect(parsedAt(result.parsed, 0).valueText).toBe(
			"Has Photos, Has Albums",
		);
		expect(result.filters.photos).toEqual(["has-photos", "has-albums"]);
	});

	it("flags out-of-range numbers as invalid", () => {
		const result = parseFilterGridQuery("?ageMin=5");
		expect(result.validCount).toBe(0);
		expect(result.invalidCount).toBe(1);
		expect(parsedAt(result.parsed, 0).key).toBe("age");
		expect(parsedAt(result.parsed, 0).valid).toBe(false);
		expect(errorTextAt(result.parsed, 0)).toBe("Must be between 18 and 99");
		expect(result.filters.ageEnabled).toBe(false);
	});

	it("flags values that aren't booleans or numbers", () => {
		expect(
			errorTextAt(parseFilterGridQuery("?online=maybe").parsed, 0),
		).toBe("Expected true or false");
		expect(errorTextAt(parseFilterGridQuery("?ageMin=old").parsed, 0)).toBe(
			"Not a number",
		);
		expect(errorTextAt(parseFilterGridQuery("?tags=,").parsed, 0)).toBe(
			"No values",
		);
	});

	it("flags unknown enum ids as invalid", () => {
		const result = parseFilterGridQuery("?tribes=1,99");
		expect(parsedAt(result.parsed, 0).valid).toBe(false);
		expect(errorTextAt(result.parsed, 0)).toBe("Unknown value “99”");
		expect(result.filters.tribesEnabled).toBe(false);
	});

	it("accepts the -1 not-specified sentinel for nsfw and genders", () => {
		const nsfw = parseFilterGridQuery("?nsfw=1,-1");
		expect(parsedAt(nsfw.parsed, 0).valid).toBe(true);
		expect(nsfw.filters.acceptNSFWPicsEnabled).toBe(true);
		expect(nsfw.filters.acceptNSFWPics).toEqual([1, -1]);
		expect(parsedAt(nsfw.parsed, 0).valueText).toBe("Never, Not Specified");

		const genders = parseFilterGridQuery("?genders=-1,42");
		expect(parsedAt(genders.parsed, 0).valid).toBe(true);
		expect(genders.filters.genderEnabled).toBe(true);
		expect(genders.filters.genders).toEqual([-1, 42]);
		expect(parsedAt(genders.parsed, 0).valueText).toBe("Not Specified, 42");
	});

	it("flags the Ask me gender as invalid because the server fails on it", () => {
		const result = parseFilterGridQuery("?genders=1,62");
		expect(parsedAt(result.parsed, 0).valid).toBe(false);
		expect(errorTextAt(result.parsed, 0)).toBe("Invalid gender ID “62”");
		expect(result.filters.genderEnabled).toBe(false);
	});

	describe("the Trans tribe", () => {
		afterEach(() => {
			featureFlagsState.keys = [];
		});

		it("is invalid while the gender filter flag is on", () => {
			featureFlagsState.keys = ["gender-filter"];
			const result = parseFilterGridQuery("?tribes=1,11");
			expect(parsedAt(result.parsed, 0).valid).toBe(false);
			expect(result.filters.tribesEnabled).toBe(false);
		});

		it("is accepted while the gender filter flag is off", () => {
			const result = parseFilterGridQuery("?tribes=1,11");
			expect(parsedAt(result.parsed, 0).valid).toBe(true);
			expect(result.filters.tribes).toEqual([1, 11]);
		});
	});

	it("flags unknown keys as invalid", () => {
		const result = parseFilterGridQuery("?nope=1");
		expect(parsedAt(result.parsed, 0).valid).toBe(false);
		expect(parsedAt(result.parsed, 0).key).toBe("nope");
		expect(parsedAt(result.parsed, 0).label).toBeUndefined();
		expect(errorTextAt(result.parsed, 0)).toBe("Unknown filter");
	});

	it("words errors in the active locale", async () => {
		await setLocale({ locale: "en-XA" });
		const result = parseFilterGridQuery("?nope=1&tribes=99");
		expect(errorTextAt(result.parsed, 0)).toMatch(PSEUDO_MESSAGE);
		expect(errorTextAt(result.parsed, 1)).toMatch(PSEUDO_MESSAGE);
		expect(errorTextAt(result.parsed, 1)).toContain("99");
	});
});
