import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCascadeV4Mock } = vi.hoisted(() => ({ getCascadeV4Mock: vi.fn() }));

vi.mock("$lib/api/browse/grid", () => ({ getCascadeV4: getCascadeV4Mock }));

import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import {
	getCachedProfile,
	getGrid,
	type RenderedGridProfile,
	setCachedProfile,
} from "./grid";

afterEach(() => {
	resetNowForTesting();
});

function rendered(id: number): RenderedGridProfile {
	return {
		type: "rendered",
		id,
		displayName: "Ada",
		distance: 100,
		profilePhotosHashes: ["a"],
		unread: 0,
		onlineUntil: null,
		isFavorite: false,
		isVisiting: false,
		hasChattedInLast24Hrs: false,
	};
}

describe("grid profile cache TTL", () => {
	it("returns a cached profile within the TTL and drops it after", () => {
		let clock = 1_000;
		setNowForTesting(() => clock);

		setCachedProfile(rendered(1));
		expect(getCachedProfile(1)).toEqual(rendered(1));

		clock += 59_999;
		expect(getCachedProfile(1)).toEqual(rendered(1));

		clock += 1;
		expect(getCachedProfile(1)).toBeNull();
	});

	it("returns null for an unknown profile", () => {
		expect(getCachedProfile(999)).toBeNull();
	});
});

const v4Profile = (id: number) => ({
	profileId: id,
	displayName: "Ada",
	distanceMeters: 100,
	onlineUntil: null,
	unreadCount: 0,
	isVisiting: false,
	primaryImageUrl: "https://cdns.grindr.com/images/profile/480x480/abc",
	favorite: true,
	viewed: false,
	chatted: true,
	roaming: false,
});

const baseProfile = (id: number) => ({
	profileId: id,
	displayName: "Ada",
	onlineUntil: null,
	unreadCount: 2,
	isVisiting: true,
});

const cascade = (items: unknown[]) => {
	getCascadeV4Mock.mockResolvedValue({
		items,
		nextPage: null,
		shuffled: false,
	});
	return getGrid({ nearbyGeoHash: "u33dc0cpgp00" });
};

describe("getGrid", () => {
	beforeEach(() => {
		getCascadeV4Mock.mockReset();
	});

	it.each([
		"full_profile_v1",
		"partial_profile_v1",
		"hidden_profile_v1",
		"smart_boost_profile_v1",
	])("renders a v4 %s without resolving it", async (type) => {
		const { items } = await cascade([{ type, data: v4Profile(1) }]);

		expect(items).toEqual([
			{
				type: "rendered",
				id: 1,
				displayName: "Ada",
				distance: 100,
				profilePhotosHashes: ["abc"],
				unread: 0,
				onlineUntil: null,
				isFavorite: true,
				isVisiting: false,
				hasChattedInLast24Hrs: true,
			},
		]);
	});

	it("renders a sponsored placement from its alternative profile", async () => {
		const { items } = await cascade([
			{
				type: "sponsored_profile_v1",
				data: {
					cascadePlacementName: "grid",
					alternativeProfile: v4Profile(2),
				},
			},
		]);

		expect(items).toMatchObject([{ type: "rendered", id: 2 }]);
	});

	it("keeps a photo-less v4 profile renderable rather than resolving it", async () => {
		const { items } = await cascade([
			{
				type: "full_profile_v1",
				data: { ...v4Profile(3), primaryImageUrl: undefined },
			},
		]);

		expect(items).toMatchObject([
			{ type: "rendered", id: 3, profilePhotosHashes: null },
		]);
	});

	it.each(["hidden_profile_v1", "full_profile_v1"])(
		"falls back to lazy resolution for a base-shaped %s",
		async (type) => {
			const { items } = await cascade([{ type, data: baseProfile(7) }]);

			expect(items).toEqual([
				{ type: "lazy", id: 7, unread: 2, isVisiting: true },
			]);
		},
	);

	it("drops items that carry no profile", async () => {
		const { items } = await cascade([
			{ type: "advert_v1", data: {} },
			{ type: "top_picks_v1", data: {} },
			{
				type: "rewarded_profiles_entry_point_v1",
				data: {
					previewImageUrls: [],
					remainingRewards: 3,
					profilesPerRedemption: 9,
				},
			},
		]);

		expect(items).toEqual([]);
	});
});
