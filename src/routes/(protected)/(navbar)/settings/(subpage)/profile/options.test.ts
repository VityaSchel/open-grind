import { describe, expect, it } from "vitest";

import { ageRange, fieldLimits, heightCmRange, weightKgRange } from "./options";

describe("profile edit options", () => {
	it("keeps form limits aligned with supported profile edit ranges", () => {
		expect(fieldLimits).toEqual({ displayName: 25, aboutMe: 255 });
		expect(heightCmRange).toEqual({ min: 120, max: 250 });
		expect(weightKgRange).toEqual({ min: 30, max: 250 });
		expect(ageRange).toEqual({ min: 18, max: 99 });
	});
});
