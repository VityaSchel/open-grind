import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	isProfileViewable,
	markProfileUnviewable,
	markProfileViewable,
	onProfileViewabilityChange,
} from "$lib/api/users/profile-viewability";

const PROFILE_ID = 42;

beforeEach(() => {
	clearAccountCaches();
});

describe("markProfileUnviewable", () => {
	it("notifies listeners once per profile", () => {
		const listener = vi.fn();
		const unsubscribe = onProfileViewabilityChange(listener);

		markProfileUnviewable(PROFILE_ID);
		markProfileUnviewable(PROFILE_ID);

		expect(isProfileViewable(PROFILE_ID)).toBe(false);
		expect(listener).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
			viewable: false,
		});

		unsubscribe();
	});

	it("stops notifying an unsubscribed listener", () => {
		const listener = vi.fn();
		onProfileViewabilityChange(listener)();

		markProfileUnviewable(PROFILE_ID);

		expect(listener).not.toHaveBeenCalled();
	});
});

describe("markProfileViewable", () => {
	it("restores a profile and lets it be marked again", () => {
		const listener = vi.fn();
		const unsubscribe = onProfileViewabilityChange(listener);

		markProfileUnviewable(PROFILE_ID);
		markProfileViewable(PROFILE_ID);

		expect(isProfileViewable(PROFILE_ID)).toBe(true);
		expect(listener).toHaveBeenLastCalledWith({
			profileId: PROFILE_ID,
			viewable: true,
		});

		markProfileUnviewable(PROFILE_ID);

		expect(listener).toHaveBeenCalledTimes(3);

		unsubscribe();
	});

	it("announces a profile the server hid on its own", () => {
		const listener = vi.fn();
		const unsubscribe = onProfileViewabilityChange(listener);

		markProfileViewable(PROFILE_ID);

		expect(listener).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
			viewable: true,
		});

		unsubscribe();
	});
});

describe("account switch", () => {
	it("forgets profiles marked for the previous account", () => {
		markProfileUnviewable(PROFILE_ID);

		clearAccountCaches();

		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});
});
