import { describe, expect, it } from "vitest";

import { gendersSchema } from "$lib/model/users/genders";
import { pronounsSchema } from "$lib/model/users/pronouns";
import { profileTagsResponseSchema } from "$lib/model/users/tags";

const gender = { genderId: 1, gender: "Man", displayGroup: 1 };
const pronoun = { pronounId: 1, pronoun: "he/him" };
const tag = { tagId: 1, text: "Coffee", key: "coffee" };

describe("reference lists survive one unusable row", () => {
	it("keeps the genders it can parse", () => {
		expect(
			gendersSchema.parse([
				gender,
				{ genderId: 2 },
				{ ...gender, genderId: 3 },
			]),
		).toEqual([gender, { ...gender, genderId: 3 }]);
	});

	it("keeps the pronouns it can parse", () => {
		expect(pronounsSchema.parse([pronoun, { pronounId: 2 }])).toEqual([
			pronoun,
		]);
	});

	it("keeps the tags around an unusable one, and the category around it", () => {
		const parsed = profileTagsResponseSchema.parse([
			{
				language: "en",
				categoryCollection: [
					{
						text: "Interests",
						possessiveText: null,
						tags: [tag, { tagId: 2 }],
					},
					{ text: "Broken" },
				],
			},
		]);

		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.categoryCollection).toHaveLength(1);
		expect(parsed[0]?.categoryCollection[0]?.tags).toEqual([tag]);
	});

	it("still rejects a response that is not a list", () => {
		expect(gendersSchema.safeParse(gender).success).toBe(false);
	});
});
