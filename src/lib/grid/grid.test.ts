import { afterEach, describe, expect, it } from "vitest";

import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import {
	getCachedProfile,
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
