import { describe, expect, it } from "vitest";

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
	it("lists every documented category", () => {
		expect(manifest().category.map(({ name }) => name)).toEqual([
			"body",
			"dating+sex",
			"featured",
			"holiday",
			"mood",
			"objects",
			"profile",
			"wen_ching_taiwan_stickers",
		]);
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
