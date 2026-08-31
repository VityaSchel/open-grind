import { describe, expect, it } from "vitest";

import { cascadeV4ResponseSchema } from "./v4";

const profileWithoutLastOnline = {
	profileId: 1,
	onlineUntil: 0,
	displayName: "Ada",
	distanceMeters: 100,
	primaryImageUrl: "https://cdns.grindr.com/images/profile/480x480/abc",
	rightNow: "NOT_ACTIVE",
	unreadCount: 0,
	isVisiting: false,
	isPopular: false,
	favorite: false,
	viewed: false,
	chatted: false,
	roaming: false,
};

const profile = { ...profileWithoutLastOnline, lastOnline: 1_710_000_000_000 };

const rewardedProfilesEntryPoint = {
	type: "rewarded_profiles_entry_point_v1",
	data: {
		previewImageUrls: Array.from(
			{ length: 9 },
			(_, index) =>
				`https://cdns.grindr.com/images/profile/480x480/abc${index}`,
		),
		remainingRewards: 3,
		profilesPerRedemption: 9,
	},
};

const response = (items: unknown[]) => ({
	items,
	nextPage: null,
	shuffled: false,
	hiddenProfiles: [],
	hiddenProfileInfo: [],
});

describe("cascadeV4ResponseSchema", () => {
	it("accepts a profile item without lastOnline", () => {
		expect(
			cascadeV4ResponseSchema.safeParse(
				response([
					{ type: "full_profile_v1", data: profile },
					{ type: "full_profile_v1", data: profileWithoutLastOnline },
					{
						type: "partial_profile_v1",
						data: {
							...profileWithoutLastOnline,
							upsellItemType: "xtra",
						},
					},
				]),
			).success,
		).toBe(true);
	});

	it.each([
		"onlineUntil",
		"rightNow",
		"unreadCount",
		"isVisiting",
		"isPopular",
	])("accepts a profile item that omits %s", (field) => {
		const data: Record<string, unknown> = { ...profile };
		delete data[field];

		expect(
			cascadeV4ResponseSchema.safeParse(
				response([{ type: "full_profile_v1", data }]),
			).success,
		).toBe(true);
	});

	it("accepts a fractional distance", () => {
		const parsed = cascadeV4ResponseSchema.parse(
			response([
				{
					type: "full_profile_v1",
					data: { ...profile, distanceMeters: 1234.5 },
				},
			]),
		);

		expect(parsed.items[0]).toHaveProperty("data.distanceMeters", 1234.5);
	});

	it("still rejects a profile item without profileId", () => {
		expect(
			cascadeV4ResponseSchema.safeParse(
				response([
					{
						type: "full_profile_v1",
						data: { ...profile, profileId: undefined },
					},
				]),
			).success,
		).toBe(false);
	});

	it.each(["hiddenProfiles", "hiddenProfileInfo"] as const)(
		"accepts a page that omits %s",
		(key) => {
			const page: Record<string, unknown> = response([]);
			delete page[key];

			expect(cascadeV4ResponseSchema.safeParse(page).success).toBe(true);
		},
	);

	it("accepts a rewarded profiles entry point item", () => {
		const parsed = cascadeV4ResponseSchema.parse(
			response([
				{ type: "full_profile_v1", data: profile },
				rewardedProfilesEntryPoint,
				{ type: "xtra_mpu_v1", data: {} },
			]),
		);

		expect(parsed.items.map((item) => item.type)).toEqual([
			"full_profile_v1",
			"rewarded_profiles_entry_point_v1",
			"xtra_mpu_v1",
		]);
	});

	it("drops an unknown explore aggregation item without failing the page", () => {
		const exploreAggregation = (items: unknown[]) => ({
			type: "explore_aggregation_v1",
			data: {
				uuid: "agg-1",
				headerName: "Nearby",
				source: "explore",
				items,
			},
		});

		const parsed = cascadeV4ResponseSchema.parse(
			response([
				exploreAggregation([
					{ "@type": "ExploreAggregationItem$Cta" },
					{
						"@type": "ExploreAggregationItem$SomethingNew",
						data: {},
					},
				]),
			]),
		);

		expect(parsed.items).toHaveLength(1);
		expect(parsed.items[0]).toHaveProperty("data.items", [
			{ "@type": "ExploreAggregationItem$Cta" },
		]);
	});

	it("drops an item type it has never seen instead of failing the page", () => {
		const parsed = cascadeV4ResponseSchema.parse(
			response([
				{ type: "full_profile_v1", data: profile },
				{ type: "some_future_item_v1", data: { anything: true } },
				{ type: "xtra_mpu_v1", data: {} },
			]),
		);

		expect(parsed.items.map((item) => item.type)).toEqual([
			"full_profile_v1",
			"xtra_mpu_v1",
		]);
	});

	it("keeps a profile whose body type the server has just added", () => {
		const parsed = cascadeV4ResponseSchema.parse(
			response([
				{
					type: "full_profile_v1",
					data: { ...profile, bodyType: 9_999 },
				},
			]),
		);

		expect(parsed.items[0]).toHaveProperty("data.bodyType", null);
	});

	it("still rejects a modeled item whose body drifted", () => {
		expect(
			cascadeV4ResponseSchema.safeParse(
				response([
					{ type: "some_future_item_v1", data: {} },
					{ type: "advert_v1", data: {} },
				]),
			).success,
		).toBe(false);
	});
});
