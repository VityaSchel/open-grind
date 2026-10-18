import { describe, expect, it } from "vitest";

import {
	FEATURED_CATEGORY,
	FEATURED_ORIGINAL_IDS,
	KNOWN_GAYMOJI_CATEGORIES,
} from "$lib/chat/gaymoji-sections";
import { demoGaymojiImageUrl, demoRoute } from "$lib/demo";
import { gaymojiManifestSchema } from "$lib/model/messaging/gaymoji";

function manifest() {
	return gaymojiManifestSchema.parse(
		demoRoute({
			path: "cdns.grindr.com/grindr/chat/gaymoji",
			method: "GET",
			body: undefined,
		}).body,
	);
}

describe("demo Gaymoji", () => {
	it("lists every documented category in the live manifest's order", () => {
		expect(manifest().category.map(({ name }) => name)).toEqual([
			"wen_ching_taiwan_stickers",
			"featured",
			"dating+sex",
			"body",
			"profile",
			"holiday",
			"objects",
			"mood",
		]);
	});

	it("carries every picked section icon and Featured original in its category", () => {
		const categoryOf = new Map(
			manifest().gaymoji.map(({ id, category }) => [id, category]),
		);

		for (const [category, { iconId }] of KNOWN_GAYMOJI_CATEGORIES)
			expect(categoryOf.get(iconId)).toBe(category);
		for (const id of FEATURED_ORIGINAL_IDS)
			expect(categoryOf.get(id)).toBe(FEATURED_CATEGORY);
	});

	it("lists unique items, a few of them expired", () => {
		const { gaymoji } = manifest();
		const expired = gaymoji.filter(
			({ expiredTime }) => expiredTime !== undefined,
		);

		expect(gaymoji).toHaveLength(579);
		expect(new Set(gaymoji.map(({ id }) => id)).size).toBe(579);
		expect(expired.length).toBeGreaterThan(0);
		expect(expired.length).toBeLessThan(20);
	});

	it("draws each item as a 256 by 256 image", () => {
		const svg = decodeURIComponent(demoGaymojiImageUrl("1_2_Yass.png"));

		expect(svg).toMatch(
			/^data:image\/svg\+xml,<svg [^>]*width="256" height="256"/,
		);
	});
});
