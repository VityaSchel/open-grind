import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	getCascadeV4Mock,
	updateLocationMock,
	atHomeLocationMock,
	getProfilesMock,
	clearProfileCachesMock,
} = vi.hoisted(() => ({
	getCascadeV4Mock: vi.fn(),
	updateLocationMock: vi.fn(),
	atHomeLocationMock:
		vi.fn<(request: () => Promise<unknown>) => Promise<unknown>>(),
	getProfilesMock: vi.fn(),
	clearProfileCachesMock: vi.fn(),
}));

vi.mock("$lib/api/browse/grid", () => ({ getCascadeV4: getCascadeV4Mock }));
vi.mock("$lib/api/browse/location", () => ({
	updateLocation: updateLocationMock,
}));
vi.mock("$lib/api/users/profiles", () => ({
	getProfiles: getProfilesMock,
	clearProfileCaches: clearProfileCachesMock,
}));
vi.mock("$lib/entitlements/honduras-hold", () => ({
	atHomeLocation: atHomeLocationMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import {
	getCachedProfile,
	getGrid,
	resolveLazyProfile,
	setCachedProfile,
} from "./grid";
import { rendered } from "./grid-test-helpers";

afterEach(() => {
	resetNowForTesting();
});

const gateHomeLocation = () => {
	const gate = Promise.withResolvers<void>();
	atHomeLocationMock.mockImplementation(async (request) => {
		await gate.promise;
		return request();
	});
	return gate.resolve;
};

describe("grid profile cache TTL", () => {
	it("returns a cached profile within the TTL and drops it after", () => {
		let clock = 1_000;
		setNowForTesting(() => clock);

		setCachedProfile(rendered({ id: 1 }));
		expect(getCachedProfile(1)).toEqual(rendered({ id: 1 }));

		clock += 59_999;
		expect(getCachedProfile(1)).toEqual(rendered({ id: 1 }));

		clock += 1;
		expect(getCachedProfile(1)).toBeNull();
	});

	it("returns null for an unknown profile", () => {
		expect(getCachedProfile(999)).toBeNull();
	});
});

const LAST_ONLINE = 1_757_000_000_000;
const NEARBY = "u33dc0cpgp00";
const NEARBY_WITHIN_COARSE_CELL = "u33dc0cpgp01";
const FAR = "u281z7hdm51t";

const v4Profile = (id: number) => ({
	profileId: id,
	displayName: "Ada",
	age: 27,
	distanceMeters: 100,
	onlineUntil: null,
	lastOnline: LAST_ONLINE,
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
	return getGrid({ nearbyGeoHash: NEARBY });
};

describe("getGrid", () => {
	beforeEach(() => {
		getCascadeV4Mock
			.mockReset()
			.mockResolvedValue({ items: [], nextPage: null, shuffled: false });
		updateLocationMock.mockReset().mockResolvedValue(undefined);
		atHomeLocationMock
			.mockReset()
			.mockImplementation((request) => request());
	});

	it("moves the stored location to the grid geohash before a favorites cascade", async () => {
		let finishMove!: () => void;
		updateLocationMock.mockReturnValue(
			new Promise<void>((resolve) => {
				finishMove = resolve;
			}),
		);

		const pending = getGrid({ nearbyGeoHash: NEARBY, favorites: true });
		await vi.waitFor(() =>
			expect(updateLocationMock).toHaveBeenCalledExactlyOnceWith({
				geohash: NEARBY,
			}),
		);
		expect(getCascadeV4Mock).not.toHaveBeenCalled();

		finishMove();
		await pending;

		expect(getCascadeV4Mock).toHaveBeenCalledOnce();
	});

	it.each([
		{ page: "a plain first page", query: {} },
		{
			page: "a later favorites page",
			query: { favorites: true, pageNumber: 1 },
		},
	])("leaves the stored location alone for $page", async ({ query }) => {
		await getGrid({ nearbyGeoHash: NEARBY, ...query });

		expect(updateLocationMock).not.toHaveBeenCalled();
		expect(getCascadeV4Mock).toHaveBeenCalledOnce();
	});

	it("still loads favorites when the location update fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const failure = new Error("offline");
		updateLocationMock.mockRejectedValue(failure);
		getCascadeV4Mock.mockResolvedValue({
			items: [{ type: "full_profile_v1", data: v4Profile(9) }],
			nextPage: null,
			shuffled: false,
		});

		const { items } = await getGrid({
			nearbyGeoHash: NEARBY,
			favorites: true,
		});

		expect(items).toMatchObject([{ id: 9 }]);
		expect(consoleError).toHaveBeenCalledWith(failure);
		consoleError.mockRestore();
	});

	it("holds the favorites location update and its cascade until the profile is back home", async () => {
		const openGate = gateHomeLocation();

		const pending = getGrid({ nearbyGeoHash: NEARBY, favorites: true });
		await vi.waitFor(() =>
			expect(atHomeLocationMock).toHaveBeenCalledOnce(),
		);
		expect(updateLocationMock).not.toHaveBeenCalled();
		expect(getCascadeV4Mock).not.toHaveBeenCalled();

		openGate();
		await pending;

		expect(updateLocationMock).toHaveBeenCalledExactlyOnceWith({
			geohash: NEARBY,
		});
		expect(getCascadeV4Mock).toHaveBeenCalledOnce();
	});

	it("holds a plain cascade until the profile is back home", async () => {
		const openGate = gateHomeLocation();

		const pending = cascade([]);
		await vi.waitFor(() =>
			expect(atHomeLocationMock).toHaveBeenCalledOnce(),
		);
		expect(getCascadeV4Mock).not.toHaveBeenCalled();

		openGate();
		await pending;

		expect(getCascadeV4Mock).toHaveBeenCalledExactlyOnceWith({
			nearbyGeoHash: NEARBY,
		});
	});

	it.each([
		{
			query: { favorites: true },
			expected: [
				"request started",
				"location moved",
				"cascade answered",
				"request settled",
			],
		},
		{
			query: {},
			expected: [
				"request started",
				"cascade answered",
				"request settled",
			],
		},
	])(
		"sends every location-moving request of $query as one home-location request",
		async ({ query, expected }) => {
			const events: string[] = [];
			atHomeLocationMock.mockImplementation(async (request) => {
				events.push("request started");
				const result = await request();
				events.push("request settled");
				return result;
			});
			updateLocationMock.mockImplementation(async () => {
				await Promise.resolve();
				events.push("location moved");
			});
			getCascadeV4Mock.mockImplementation(async () => {
				await Promise.resolve();
				events.push("cascade answered");
				return {
					items: [{ type: "full_profile_v1", data: v4Profile(5) }],
					nextPage: null,
					shuffled: false,
				};
			});

			const { items } = await getGrid({
				nearbyGeoHash: NEARBY,
				...query,
			});

			expect(atHomeLocationMock).toHaveBeenCalledOnce();
			expect(events).toEqual(expected);
			expect(items).toMatchObject([{ id: 5 }]);
		},
	);

	it.each([
		{ type: "full_profile_v1", age: 27 },
		{ type: "partial_profile_v1", age: undefined },
		{ type: "smart_boost_profile_v1", age: 27 },
	])(
		"renders a v4 $type without resolving it, with age $age",
		async ({ type, age }) => {
			const { items } = await cascade([{ type, data: v4Profile(1) }]);

			expect(items).toEqual([
				{
					type: "rendered",
					id: 1,
					displayName: "Ada",
					age,
					distance: 100,
					profilePhotosHashes: ["abc"],
					unread: 0,
					onlineUntil: null,
					seen: LAST_ONLINE,
					isFavorite: true,
					isVisiting: false,
					hasChattedInLast24Hrs: true,
				},
			]);
		},
	);

	it("marks a full row that sends no age as showing none, not unknown", async () => {
		const { items } = await cascade([
			{
				type: "full_profile_v1",
				data: { ...v4Profile(4), age: undefined },
			},
		]);

		expect(items).toMatchObject([{ id: 4, age: null }]);
	});

	it("leaves last seen empty when the cascade sends none", async () => {
		const { items } = await cascade([
			{
				type: "full_profile_v1",
				data: { ...v4Profile(6), lastOnline: undefined },
			},
		]);

		expect(items).toMatchObject([{ id: 6, seen: null }]);
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

		expect(items).toMatchObject([
			{ type: "rendered", id: 2, age: 27, seen: LAST_ONLINE },
		]);
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

	it("falls back to lazy resolution for a base-shaped profile", async () => {
		const { items } = await cascade([
			{ type: "full_profile_v1", data: baseProfile(7) },
		]);

		expect(items).toEqual([
			{ type: "lazy", id: 7, unread: 2, isVisiting: true },
		]);
	});

	it.each([
		{ shape: "v4", data: v4Profile(8) },
		{ shape: "base", data: baseProfile(8) },
	])(
		"drops a $shape-shaped hidden profile like the official grid",
		async ({ data }) => {
			const { items } = await cascade([
				{ type: "hidden_profile_v1", data },
			]);

			expect(items).toEqual([]);
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

describe("cached profiles after the stored location moves", () => {
	beforeEach(async () => {
		clearAccountCaches();
		getCascadeV4Mock
			.mockReset()
			.mockResolvedValue({ items: [], nextPage: null, shuffled: false });
		updateLocationMock.mockReset().mockResolvedValue(undefined);
		atHomeLocationMock
			.mockReset()
			.mockImplementation((request) => request());
		await getGrid({ nearbyGeoHash: NEARBY });
		clearProfileCachesMock.mockReset();
	});

	it("drops them once a favorites location update lands", async () => {
		setCachedProfile(rendered({ id: 1 }));
		let finishMove!: () => void;
		updateLocationMock.mockReturnValue(
			new Promise<void>((resolve) => {
				finishMove = resolve;
			}),
		);

		const pending = getGrid({ nearbyGeoHash: FAR, favorites: true });
		await vi.waitFor(() => expect(updateLocationMock).toHaveBeenCalled());
		expect(clearProfileCachesMock).not.toHaveBeenCalled();
		expect(getCachedProfile(1)).not.toBeNull();

		finishMove();
		await pending;

		expect(clearProfileCachesMock).toHaveBeenCalledOnce();
		expect(getCachedProfile(1)).toBeNull();
	});

	it("drops them only once a plain cascade at a new location answered", async () => {
		let answer!: () => void;
		getCascadeV4Mock.mockReturnValue(
			new Promise((resolve) => {
				answer = () =>
					resolve({ items: [], nextPage: null, shuffled: false });
			}),
		);

		const pending = getGrid({ nearbyGeoHash: FAR });
		await vi.waitFor(() => expect(getCascadeV4Mock).toHaveBeenCalled());
		expect(clearProfileCachesMock).not.toHaveBeenCalled();

		answer();
		await pending;

		expect(clearProfileCachesMock).toHaveBeenCalledOnce();
	});

	it.each([
		{ spot: "the same location", geohash: NEARBY },
		{
			spot: "a spot in the same coarse cell",
			geohash: NEARBY_WITHIN_COARSE_CELL,
		},
	])("keeps them for fetches at $spot", async ({ geohash }) => {
		setCachedProfile(rendered({ id: 1 }));

		await getGrid({ nearbyGeoHash: geohash });
		await getGrid({ nearbyGeoHash: geohash, favorites: true });

		expect(clearProfileCachesMock).not.toHaveBeenCalled();
		expect(getCachedProfile(1)).not.toBeNull();
	});

	it("forgets the stored location on an account switch", async () => {
		clearAccountCaches();

		await getGrid({ nearbyGeoHash: NEARBY });

		expect(clearProfileCachesMock).toHaveBeenCalledOnce();
	});

	it("keeps them when the favorites location update fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		updateLocationMock.mockRejectedValue(new Error("offline"));

		await getGrid({ nearbyGeoHash: FAR, favorites: true });

		expect(clearProfileCachesMock).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});
});

describe("resolveLazyProfile", () => {
	it("maps the resolved profile, age and last seen included", async () => {
		getProfilesMock.mockResolvedValue([
			{
				profileId: 11,
				displayName: "Bo",
				age: 31,
				distance: 250,
				medias: [{ mediaHash: "first" }, { mediaHash: "second" }],
				onlineUntil: null,
				seen: LAST_ONLINE,
				isFavorite: true,
				lastChatTimestamp: null,
			},
		]);

		const profile = await resolveLazyProfile({
			type: "lazy",
			id: 11,
			unread: 3,
			isVisiting: true,
		});

		expect(getProfilesMock).toHaveBeenCalledExactlyOnceWith([11]);
		expect(profile).toEqual({
			type: "rendered",
			id: 11,
			displayName: "Bo",
			age: 31,
			distance: 250,
			profilePhotosHashes: ["first", "second"],
			unread: 3,
			onlineUntil: null,
			seen: LAST_ONLINE,
			isFavorite: true,
			isVisiting: true,
			hasChattedInLast24Hrs: false,
		});
	});
});
