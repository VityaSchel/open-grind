import { describe, expect, it } from "vitest";

import { demoRoute } from "#lib/demo/index.ts";
import { profileSeed } from "#lib/demo/mock/profiles.ts";
import { cascadeV4ResponseSchema } from "#lib/model/browse/grid/cascade/response/v4.ts";
import { FilterPosition } from "#lib/model/browse/grid/filters.ts";
import { rightNowFeedResponseSchema } from "#lib/model/right-now/feed.ts";
import { rightNowPostResponseSchema } from "#lib/model/right-now/post.ts";

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

const getDemo = (path: string) =>
	demoRoute({ path, method: "GET", body: undefined }).body;

const cascadeProfiles = (query: string) => {
	const profiles = [];
	for (let page: number | null = 0; page !== null; ) {
		const { items, nextPage } = cascadeV4ResponseSchema.parse(
			getDemo(`/v4/cascade?nearbyGeoHash=u00${query}&pageNumber=${page}`),
		);
		for (const item of items) {
			if (
				"data" in item &&
				"profileId" in item.data &&
				"rightNow" in item.data
			)
				profiles.push(item.data);
		}
		page = nextPage;
	}
	return profiles;
};

describe("demo right now status", () => {
	it("serves a Right Now post for exactly the cascade profiles marked as on Right Now", () => {
		const profiles = cascadeProfiles("");
		const mismatched = profiles.filter(({ profileId, rightNow }) => {
			const { post } = rightNowPostResponseSchema.parse(
				getDemo(`/v3/rightnow/profiles/${profileId}`),
			);
			if (post === null) return rightNow !== "NOT_ACTIVE";
			return rightNow !== (post.hosting ? "HOSTING" : "NOT_HOSTING");
		});

		expect(mismatched).toEqual([]);
		expect(new Set(profiles.map(({ rightNow }) => rightNow))).toEqual(
			new Set(["NOT_ACTIVE", "HOSTING", "NOT_HOSTING"]),
		);
	});

	it("a Right Now cascade lists only profiles on Right Now", () => {
		const statuses = cascadeProfiles("&rightNow=true").map(
			({ rightNow }) => rightNow,
		);

		expect(new Set(statuses)).toEqual(new Set(["HOSTING", "NOT_HOSTING"]));
	});
});
