import { describe, expect, it } from "vitest";

import { demoRoute } from "#lib/demo/index.ts";
import { profileSeed } from "#lib/demo/mock/profiles.ts";
import { FilterPosition } from "#lib/model/browse/grid/filters.ts";
import { rightNowFeedResponseSchema } from "#lib/model/right-now/feed.ts";

const posts = (query: string) => {
	const { body } = demoRoute({
		path: `/v6/rightnow/feed${query}`,
		method: "GET",
		body: undefined,
	});
	return rightNowFeedResponseSchema
		.parse(body)
		.items.flatMap((item) => ("hosting" in item.data ? [item.data] : []));
};

describe("demo right now feed", () => {
	it("keeps only the posts its feed query asks for, in the order it asks for", () => {
		const newest = posts("");
		const filtered = posts(
			"?sort=DISTANCE&hosting=true&ageMin=20&ageMax=40&sexualPositions=1,-1",
		);
		const posted = newest.map((post) => post.posted);
		expect(posted).toEqual(posted.toSorted((a, b) => b - a));
		expect(filtered.length).toBeGreaterThan(0);
		expect(newest.length).toBeGreaterThan(filtered.length);
		for (const post of filtered) {
			const { age, position } =
				"profileFields" in post
					? post.profileFields
					: profileSeed(post.profileId);
			expect(post.hosting).toBe(true);
			expect(age).toBeGreaterThanOrEqual(20);
			expect(age).toBeLessThanOrEqual(40);
			expect([FilterPosition.Top, null]).toContain(position);
		}
		const distances = filtered.map((post) => post.distance ?? Infinity);
		expect(distances).toEqual(distances.toSorted((a, b) => a - b));
	});
});
