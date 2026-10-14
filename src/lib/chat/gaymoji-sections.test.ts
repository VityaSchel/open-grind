import { describe, expect, it } from "vitest";

import { gaymojiSections } from "$lib/chat/gaymoji-sections";
import type { GaymojiCategory, GaymojiItem } from "$lib/api/messaging/gaymoji";

function item(id: string): GaymojiItem {
	return {
		id,
		label: id.replace(/\.png$/, ""),
		imageUrl: `https://example.test/${id}`,
		imageHash: `gaymoji/${id}`,
	};
}

function category(name: string, ids: string[]): GaymojiCategory {
	return { name, items: ids.map(item) };
}

function outline(categories: GaymojiCategory[]) {
	return gaymojiSections(categories).map(({ key, title, icon, items }) => ({
		key,
		title,
		icon: icon.id,
		items: items.map(({ id }) => id),
	}));
}

describe("gaymojiSections", () => {
	it("titles known categories in manifest order and moves Featured's originals to a last Other section", () => {
		expect(
			outline([
				category("wen_ching_taiwan_stickers", [
					"wen_ching_01_hi.png",
					"wen_ching_05_type.png",
				]),
				category("featured", [
					"1_2_Yass.png",
					"1_6_2_WGgaysRule.png",
					"2_3_Eggplant.png",
					"Pinky_up.png",
				]),
				category("dating+sex", [
					"1_10_Turnt.png",
					"2_1_Eggplant_1.png",
				]),
			]),
		).toEqual([
			{
				key: "wen_ching_taiwan_stickers",
				title: "Wen Ching",
				icon: "wen_ching_05_type.png",
				items: ["wen_ching_01_hi.png", "wen_ching_05_type.png"],
			},
			{
				key: "dating+sex",
				title: "Dating & Sex",
				icon: "2_1_Eggplant_1.png",
				items: ["1_10_Turnt.png", "2_1_Eggplant_1.png"],
			},
			{
				key: "featured",
				title: "Other",
				icon: "1_6_2_WGgaysRule.png",
				items: ["1_6_2_WGgaysRule.png", "Pinky_up.png"],
			},
		]);
	});

	it("falls back to the first item when the picked icon is missing", () => {
		expect(outline([category("mood", ["10_Chill_Mask.png"])])).toEqual([
			{
				key: "mood",
				title: "Mood",
				icon: "10_Chill_Mask.png",
				items: ["10_Chill_Mask.png"],
			},
		]);
	});

	it("titles an unknown category from its name", () => {
		expect(
			outline([category("bears+otters_2024", ["Bear.png", "Otter.png"])]),
		).toEqual([
			{
				key: "bears+otters_2024",
				title: "Bears & otters 2024",
				icon: "Bear.png",
				items: ["Bear.png", "Otter.png"],
			},
		]);
	});

	it("leaves out Other when Featured has no originals", () => {
		expect(
			outline([
				category("featured", ["1_2_Yass.png"]),
				category("body", ["Bicep_with_medium_skin_tone.png"]),
			]).map(({ key }) => key),
		).toEqual(["body"]);
	});
});
