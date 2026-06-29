import { describe, expect, it } from "vitest";

import { defaultFilters } from "$lib/components/filters/filters";
import { parseFilterGridQuery } from "./filter-grid-query";

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

	it("renders min and max as a single field, matching the filters UI", () => {
		const result = parseFilterGridQuery("?ageMin=25&ageMax=40");
		expect(result.parsed).toHaveLength(1);
		expect(result.parsed[0].key).toBe("age");
		expect(result.parsed[0].valueText).toBe("25 - 40");
	});

	it("supports the combined `age=min-max` syntax with an open bound", () => {
		const result = parseFilterGridQuery("?age=30-");
		expect(result.filters.age).toEqual([30, defaultFilters.age[1]]);
		expect(result.parsed[0].valueText).toBe("30 years & over");
	});

	it("accepts aliases", () => {
		const result = parseFilterGridQuery("?online=true&position=1,3");
		expect(result.filters.isOnline).toBe(true);
		expect(result.filters.positionEnabled).toBe(true);
		expect(result.filters.positions).toEqual([1, 3]);
		expect(result.parsed.map((p) => p.key)).toEqual(["online", "position"]);
		expect(result.parsed[1].valueText).toBe("Top, Versatile");
	});

	it("rejects an incomplete combined range without throwing", () => {
		for (const query of ["?age=", "?age=25", "?height=170", "?weight=70"]) {
			const result = parseFilterGridQuery(query);
			expect(result.parsed).toHaveLength(1);
			expect(result.parsed[0].valid).toBe(false);
			expect(result.parsed[0].error).toBe("Use min-max, e.g. 25-40");
		}
		expect(parseFilterGridQuery("?age=").filters.ageEnabled).toBe(false);
	});

	it("renders human labels for enum values", () => {
		const result = parseFilterGridQuery("?tribes=1,6");
		expect(result.parsed[0].valueText).toBe("Bear, Jock");
	});

	it("combines photo flags into a single photos field", () => {
		const result = parseFilterGridQuery("?photoOnly=true&hasAlbum=true");
		expect(result.parsed).toHaveLength(1);
		expect(result.parsed[0].key).toBe("photos");
		expect(result.parsed[0].valueText).toBe("Has photos, Has albums");
		expect(result.filters.photos).toEqual(["has-photos", "has-albums"]);
	});

	it("flags out-of-range numbers as invalid", () => {
		const result = parseFilterGridQuery("?ageMin=5");
		expect(result.validCount).toBe(0);
		expect(result.invalidCount).toBe(1);
		expect(result.parsed[0].key).toBe("age");
		expect(result.parsed[0].valid).toBe(false);
		expect(result.filters.ageEnabled).toBe(false);
	});

	it("flags unknown enum ids as invalid", () => {
		const result = parseFilterGridQuery("?tribes=1,99");
		expect(result.parsed[0].valid).toBe(false);
		expect(result.filters.tribesEnabled).toBe(false);
	});

	it("flags unknown keys as invalid", () => {
		const result = parseFilterGridQuery("?nope=1");
		expect(result.parsed[0].valid).toBe(false);
		expect(result.parsed[0].key).toBe("nope");
		expect(result.parsed[0].error).toBe("Unknown filter");
	});
});
