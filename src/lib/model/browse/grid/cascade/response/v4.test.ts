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
});
