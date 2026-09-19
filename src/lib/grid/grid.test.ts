import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCascadeV4Mock, awaitEntitlementGrantMock, getProfilesMock } =
	vi.hoisted(() => ({
		getCascadeV4Mock: vi.fn(),
		awaitEntitlementGrantMock: vi.fn(),
		getProfilesMock: vi.fn(),
	}));

vi.mock("$lib/api/browse/grid", () => ({ getCascadeV4: getCascadeV4Mock }));
vi.mock("$lib/api/users/profiles", () => ({ getProfiles: getProfilesMock }));
vi.mock("$lib/entitlements/bypass.svelte", () => ({
	awaitEntitlementGrant: awaitEntitlementGrantMock,
}));

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
	return getGrid({ nearbyGeoHash: "u33dc0cpgp00" });
};

describe("getGrid", () => {
	beforeEach(() => {
		getCascadeV4Mock.mockReset();
		awaitEntitlementGrantMock.mockResolvedValue(undefined);
	});

	it("holds the cascade until an entitlement handover is done", async () => {
		let finishHandover!: () => void;
		awaitEntitlementGrantMock.mockReturnValue(
			new Promise<void>((resolve) => {
				finishHandover = resolve;
			}),
		);

		const pending = cascade([]);
		await vi.waitFor(() => expect(finishHandover).toBeDefined());
		expect(getCascadeV4Mock).not.toHaveBeenCalled();

		finishHandover();
		await pending;

		expect(getCascadeV4Mock).toHaveBeenCalledOnce();
	});

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
