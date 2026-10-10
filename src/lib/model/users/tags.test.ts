import { describe, expect, it } from "vitest";

import { isTagKeyOffered } from "$lib/model/users/tags";

describe("isTagKeyOffered", () => {
	it("withholds the FTM and MTF tags while the gender filter flag is on", () => {
		const isOffered = (key: string) =>
			isTagKeyOffered({ key, genderFilterFlag: true });
		expect(isOffered("ftm")).toBe(false);
		expect(isOffered("mtf")).toBe(false);
		expect(isOffered("coffee")).toBe(true);
	});

	it("offers the FTM and MTF tags while the gender filter flag is off", () => {
		expect(isTagKeyOffered({ key: "ftm", genderFilterFlag: false })).toBe(
			true,
		);
		expect(isTagKeyOffered({ key: "mtf", genderFilterFlag: false })).toBe(
			true,
		);
	});
});
