import { afterEach, describe, expect, it, vi } from "vitest";

const profiles = vi.hoisted(() => ({
	calls: [] as string[],
	saveProfilePhotos: vi.fn(),
	deleteProfilePhotos: vi.fn(),
}));

vi.mock("$lib/api/users/profiles", () => profiles);

import {
	profilePhotoChanges,
	saveProfilePhotoChanges,
} from "./profile-photo-changes";

afterEach(() => {
	vi.clearAllMocks();
	profiles.calls.length = 0;
});

describe("profilePhotoChanges", () => {
	it("sends nothing when the photos are as saved", () => {
		expect(
			profilePhotoChanges({ saved: ["a", "b"], sent: ["a", "b"] }),
		).toEqual({ order: null, removed: [] });
	});

	it("sends the new order after a reorder", () => {
		expect(
			profilePhotoChanges({ saved: ["a", "b"], sent: ["b", "a"] }),
		).toEqual({ order: ["b", "a"], removed: [] });
	});

	it("sends the order with a new upload and removes a dropped photo", () => {
		expect(
			profilePhotoChanges({ saved: ["a", "b"], sent: ["a", "fresh"] }),
		).toEqual({ order: ["a", "fresh"], removed: ["b"] });
	});
});

describe("saveProfilePhotoChanges", () => {
	it("sets the new order before deleting what was removed", async () => {
		profiles.saveProfilePhotos.mockImplementation(async () => {
			await Promise.resolve();
			profiles.calls.push("put");
		});
		profiles.deleteProfilePhotos.mockImplementation(() => {
			profiles.calls.push("delete");
			return Promise.resolve();
		});

		await saveProfilePhotoChanges({
			cacheProfileId: 1,
			changes: { order: ["a", "fresh"], removed: ["b"] },
		});

		expect(profiles.calls).toEqual(["put", "delete"]);
		expect(profiles.saveProfilePhotos).toHaveBeenCalledWith({
			cacheProfileId: 1,
			mediaHashes: ["a", "fresh"],
		});
		expect(profiles.deleteProfilePhotos).toHaveBeenCalledWith({
			cacheProfileId: 1,
			mediaHashes: ["b"],
		});
	});

	it("leaves the order alone when it did not change", async () => {
		await saveProfilePhotoChanges({
			cacheProfileId: 1,
			changes: { order: null, removed: [] },
		});

		expect(profiles.saveProfilePhotos).not.toHaveBeenCalled();
	});
});
