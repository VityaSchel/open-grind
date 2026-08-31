import { describe, expect, it } from "vitest";

import {
	BodyType,
	healthPracticeLabels,
	healthPractices,
	profileSchema,
	Tribe,
	UnsettableHealthPractice,
} from "$lib/model/users/profiles";

const unknownToUs = 9_999;

describe("profileSchema tolerance to new server vocabularies", () => {
	const { bodyType, ethnicity, grindrTribes, lookingFor, rightNow, tapType } =
		profileSchema.shape;

	it("keeps an unrecognized vocabulary id so editing cannot delete it", () => {
		expect(bodyType.parse(unknownToUs)).toBe(unknownToUs);
		expect(ethnicity.parse(unknownToUs)).toBe(unknownToUs);
		expect(
			grindrTribes.parse([Tribe.Bear, unknownToUs, Tribe.Daddy]),
		).toEqual([Tribe.Bear, unknownToUs, Tribe.Daddy]);
		expect(lookingFor.parse([unknownToUs])).toEqual([unknownToUs]);
	});

	it("keeps recognized vocabulary ids", () => {
		expect(bodyType.parse(BodyType.Slim)).toBe(BodyType.Slim);
		expect(grindrTribes.parse([Tribe.Otter])).toEqual([Tribe.Otter]);
	});

	it("falls back to NOT_ACTIVE for an unrecognized right now status", () => {
		expect(rightNow.parse("BRAND_NEW_STATUS")).toBe("NOT_ACTIVE");
		expect(rightNow.parse("HOSTING")).toBe("HOSTING");
	});

	it("degrades an unrecognized tap type to null", () => {
		expect(tapType.parse(unknownToUs)).toBeNull();
	});
});

describe("profileSchema tolerance to omitted fields", () => {
	it("renders a profile carrying nothing but its id", () => {
		const parsed = profileSchema.parse({ profileId: 42 });

		expect(parsed.profileId).toBe(42);
		expect(parsed.displayName).toBeNull();
		expect(parsed.medias).toEqual([]);
		expect(parsed.grindrTribes).toEqual([]);
		expect(parsed.isFavorite).toBe(false);
		expect(parsed.socialNetworks).toEqual({});
		expect(parsed.rightNow).toBe("NOT_ACTIVE");
	});

	it("still rejects a profile with no id", () => {
		expect(profileSchema.safeParse({}).success).toBe(false);
	});
});

describe("profileSchema treats an explicit null as an absent field", () => {
	it.each(["isFavorite", "medias", "grindrTribes", "socialNetworks"])(
		"accepts a null %s, as the official client does",
		(field) => {
			expect(
				profileSchema.safeParse({ profileId: 42, [field]: null })
					.success,
			).toBe(true);
		},
	);

	it("still rejects a field whose type drifted", () => {
		expect(
			profileSchema.safeParse({ profileId: 42, isFavorite: "yes" })
				.success,
		).toBe(false);
	});
});

describe("health practices we can show but not set", () => {
	it("labels the practices only Grindr can set", () => {
		expect(healthPracticeLabels[UnsettableHealthPractice.Sober]).toBe(
			"Sober",
		);
		expect(healthPracticeLabels[UnsettableHealthPractice.DrugFree]).toBe(
			"Drug-Free",
		);
	});

	it("keeps them out of the vocabulary we offer and send", () => {
		expect(Object.keys(healthPractices)).toEqual(["1", "2", "3", "4", "5"]);
	});

	it("still labels the practice the current Grindr build dropped", () => {
		expect(healthPracticeLabels[4]).toBe("I'm HIV undetectable");
	});
});
