import { afterEach, describe, expect, it, vi } from "vitest";

import { gaymojiManifestSchema } from "$lib/model/messaging/gaymoji";

function manifestCapture() {
	return {
		lastUpdateTime: 1605145583000,
		category: [
			{ name: "wen_ching_taiwan_stickers", expiredTime: 1621843200000 },
			{ name: "featured", expiredTime: 0 },
			{ name: "body", expiredTime: 0 },
		],
		gaymoji: [
			{
				name: "Bicep_with_dark_skin_tone",
				id: "Bicep_with_dark_skin_tone.png",
				category: "body",
			},
			{ name: "1_2_Yass", id: "1_2_Yass.png", category: "featured" },
			{
				name: "Man_with_medium-light_skin_tone_buzzed_hair,_and_blonde_beard",
				id: "Man_with_medium-light_skin_tone_buzzed_hair,_and_blonde_beard.png",
				category: "profile",
			},
			{
				name: "f_Male_to_female_with_dark_skin_tone.",
				id: "f_Male_to_female_with_dark_skin_tone..png",
				category: "profile",
			},
			{
				expiredTime: 1621843200000,
				name: "wen_ching_01_hi",
				id: "wen_ching_01_hi.png",
				category: "wen_ching_taiwan_stickers",
			},
		],
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("gaymojiManifestSchema", () => {
	it("parses a captured manifest, keeping expired items in order", () => {
		const parsed = gaymojiManifestSchema.parse(manifestCapture());

		expect(parsed.lastUpdateTime).toBe(1605145583000);
		expect(parsed.gaymoji.map(({ id }) => id)).toEqual([
			"Bicep_with_dark_skin_tone.png",
			"1_2_Yass.png",
			"Man_with_medium-light_skin_tone_buzzed_hair,_and_blonde_beard.png",
			"f_Male_to_female_with_dark_skin_tone..png",
			"wen_ching_01_hi.png",
		]);
		expect(parsed.gaymoji.at(-1)?.expiredTime).toBe(1621843200000);
		expect(parsed.category.map(({ name }) => name)).toEqual([
			"wen_ching_taiwan_stickers",
			"featured",
			"body",
		]);
	});

	it("keeps items and categories it does not know", () => {
		const capture = manifestCapture();
		capture.category.push({ name: "winter", expiredTime: 0 });
		capture.gaymoji.push({
			name: "Snowman",
			id: "Snowman.png",
			category: "winter",
		});

		const parsed = gaymojiManifestSchema.parse(capture);

		expect(parsed.category.at(-1)?.name).toBe("winter");
		expect(parsed.gaymoji.at(-1)).toEqual({
			name: "Snowman",
			id: "Snowman.png",
			category: "winter",
		});
	});

	it.each([
		["a path in its id", "../Snowman.png"],
		["an id that is not a PNG", "Snowman.gif"],
		["a query in its id", "Snowman.png?x=1"],
		["an empty id", ""],
	])("drops only the item with %s", (_, id) => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const capture = manifestCapture();
		capture.gaymoji.splice(1, 0, {
			name: "Snowman",
			id,
			category: "holiday",
		});

		expect(
			gaymojiManifestSchema.parse(capture).gaymoji.map(({ id }) => id),
		).toEqual(manifestCapture().gaymoji.map(({ id }) => id));
	});
});
