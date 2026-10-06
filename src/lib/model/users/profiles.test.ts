import { describe, expect, it } from "vitest";

import {
	acceptNSFWPics,
	BodyType,
	bodyTypes,
	ethnicities,
	healthPracticeLabels,
	healthPractices,
	hivStatuses,
	hivStatusLabels,
	lookingFor,
	meetAt,
	profileSchema,
	relationshipStatuses,
	sexualPositions,
	Tribe,
	tribes,
	UnsettableHealthPractice,
	vaccines,
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

describe("vocabulary labels", () => {
	const listed = (labels: Readonly<Record<number, string>>) =>
		Object.entries(labels)
			.map(([id, label]) => `${id}=${label}`)
			.join("|");

	it("names every id in English", () => {
		const vocabularies = {
			sexualPositions,
			lookingFor,
			acceptNSFWPics,
			relationshipStatuses,
			bodyTypes,
			tribes,
			meetAt,
			ethnicities,
			hivStatuses,
			hivStatusLabels,
			healthPractices,
			healthPracticeLabels,
			vaccines,
		};

		expect(
			Object.fromEntries(
				Object.entries(vocabularies).map(([name, labels]) => [
					name,
					listed(labels),
				]),
			),
		).toEqual({
			sexualPositions:
				"1=Top|2=Bottom|3=Versatile|4=Vers Bottom|5=Vers Top|6=Side",
			lookingFor:
				"2=Chat|3=Dates|4=Friends|5=Networking|6=Relationship|7=Hookups",
			acceptNSFWPics: "1=Never|2=Not At First|3=Yes Please",
			relationshipStatuses:
				"1=Single|2=Dating|3=Exclusive|4=Committed|5=Partnered|6=Engaged|7=Married|8=Open Relationship",
			bodyTypes: "1=Toned|2=Average|3=Large|4=Muscular|5=Slim|6=Stocky",
			tribes: "1=Bear|2=Clean-Cut|3=Daddy|4=Discreet|5=Geek|6=Jock|7=Leather|8=Otter|9=Poz|10=Rugged|11=Trans|12=Twink|13=Sober",
			meetAt: "1=My Place|2=Your Place|3=Bar|4=Coffee Shop|5=Restaurant",
			ethnicities:
				"1=Asian|2=Black|3=Latino|4=Middle Eastern|5=Mixed|6=Native American|7=White|8=Other|9=South Asian",
			hivStatuses:
				"1=Negative|2=Negative, on PrEP|3=Positive|4=Positive, undetectable",
			hivStatusLabels:
				"1=Negative|2=Negative, on PrEP|3=Positive|4=Positive, undetectable|5=Prefer to discuss",
			healthPractices:
				"1=Condoms|2=I'm on doxyPEP|3=I'm on PrEP|4=I'm HIV undetectable|5=Prefer to discuss",
			healthPracticeLabels:
				"1=Condoms|2=I'm on doxyPEP|3=I'm on PrEP|4=I'm HIV undetectable|5=Prefer to discuss|6=Sober|7=Drug-Free",
			vaccines: "1=COVID-19|2=Monkeypox|3=Meningitis",
		});
	});
});
