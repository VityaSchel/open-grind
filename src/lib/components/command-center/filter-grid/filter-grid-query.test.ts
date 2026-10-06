import { afterEach, describe, expect, it } from "vitest";

import { sentFilterKeys } from "$lib/grid/grid-query";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import {
	defaultFilters,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";
import { parseFilterGridQuery } from "./filter-grid-query";

afterEach(async () => {
	await setLocale({ locale: SOURCE_LOCALE });
});

function parsedAt<T>(entries: readonly T[], index: number): T {
	const entry = entries[index];
	if (!entry) throw new Error(`no parsed filter at index ${index}`);
	return entry;
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
		expect(sentFilterKeys(result.filters)).toEqual([]);
	});

	it("rounds a typed weight in grams to whole kilograms", () => {
		const result = parseFilterGridQuery("?weightGramsMax=80600");
		expect(result.filters.weight).toEqual([WEIGHT_KG_MIN, 81]);
	});

	it("renders min and max as a single field, matching the filters UI", () => {
		const result = parseFilterGridQuery("?ageMin=25&ageMax=40");
		expect(result.parsed).toHaveLength(1);
		expect(parsedAt(result.parsed, 0).key).toBe("age");
		expect(parsedAt(result.parsed, 0).valueText).toBe("25 - 40");
	});

	it("supports the combined `age=min-max` syntax with an open bound", () => {
		const result = parseFilterGridQuery("?age=30-");
		expect(result.filters.age).toEqual([30, defaultFilters.age[1]]);
		expect(parsedAt(result.parsed, 0).valueText).toBe("30 years & over");
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
			expect(parsedAt(result.parsed, 0).error).toBe(
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
			"Has photos, Has albums",
		);
		expect(result.filters.photos).toEqual(["has-photos", "has-albums"]);
	});

	it("flags out-of-range numbers as invalid", () => {
		const result = parseFilterGridQuery("?ageMin=5");
		expect(result.validCount).toBe(0);
		expect(result.invalidCount).toBe(1);
		expect(parsedAt(result.parsed, 0).key).toBe("age");
		expect(parsedAt(result.parsed, 0).valid).toBe(false);
		expect(result.filters.ageEnabled).toBe(false);
	});

	it("flags unknown enum ids as invalid", () => {
		const result = parseFilterGridQuery("?tribes=1,99");
		expect(parsedAt(result.parsed, 0).valid).toBe(false);
		expect(result.filters.tribesEnabled).toBe(false);
	});

	it("accepts the -1 not-specified sentinel for nsfw and genders", () => {
		const nsfw = parseFilterGridQuery("?nsfw=1,-1");
		expect(parsedAt(nsfw.parsed, 0).valid).toBe(true);
		expect(nsfw.filters.acceptNSFWPicsEnabled).toBe(true);
		expect(nsfw.filters.acceptNSFWPics).toEqual([1, -1]);
		expect(parsedAt(nsfw.parsed, 0).valueText).toBe("Never, Not specified");

		const genders = parseFilterGridQuery("?genders=-1,42");
		expect(parsedAt(genders.parsed, 0).valid).toBe(true);
		expect(genders.filters.genderEnabled).toBe(true);
		expect(genders.filters.genders).toEqual([-1, 42]);
		expect(parsedAt(genders.parsed, 0).valueText).toBe("Not specified, 42");
	});

	it("flags the Ask me gender as invalid because the server fails on it", () => {
		const result = parseFilterGridQuery("?genders=1,62");
		expect(parsedAt(result.parsed, 0).valid).toBe(false);
		expect(result.filters.genderEnabled).toBe(false);
	});

	it("flags the Trans tribe as invalid because it moved to genders", () => {
		const result = parseFilterGridQuery("?tribes=1,11");
		expect(parsedAt(result.parsed, 0).valid).toBe(false);
		expect(result.filters.tribesEnabled).toBe(false);
	});

	it("flags unknown keys as invalid", () => {
		const result = parseFilterGridQuery("?nope=1");
		expect(parsedAt(result.parsed, 0).valid).toBe(false);
		expect(parsedAt(result.parsed, 0).key).toBe("nope");
		expect(parsedAt(result.parsed, 0).error).toBe("Unknown filter");
	});
});
