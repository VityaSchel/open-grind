import { afterEach, describe, expect, it, vi } from "vitest";

const profiles = vi.hoisted(() => ({ saveProfilePhotos: vi.fn() }));

vi.mock("$lib/api/users/profiles", () => profiles);

import { saveProfilePhotoOrder } from "./profile-photo-order";

afterEach(() => vi.clearAllMocks());

describe("saveProfilePhotoOrder", () => {
	it("sends nothing when the photos are as saved", async () => {
		await saveProfilePhotoOrder({
			cacheProfileId: 1,
			saved: ["a", "b"],
			kept: ["a", "b"],
		});

		expect(profiles.saveProfilePhotos).not.toHaveBeenCalled();
	});

	it("sends the new order after a reorder", async () => {
		await saveProfilePhotoOrder({
			cacheProfileId: 1,
			saved: ["a", "b"],
			kept: ["b", "a"],
		});

		expect(profiles.saveProfilePhotos).toHaveBeenCalledWith({
			cacheProfileId: 1,
			mediaHashes: ["b", "a"],
		});
	});

	it("sends the order without a removed photo", async () => {
		await saveProfilePhotoOrder({
			cacheProfileId: 1,
			saved: ["a", "b"],
			kept: ["a", "fresh"],
		});

		expect(profiles.saveProfilePhotos).toHaveBeenCalledWith({
			cacheProfileId: 1,
			mediaHashes: ["a", "fresh"],
		});
	});

	it("unsets every photo when all were removed", async () => {
		await saveProfilePhotoOrder({
			cacheProfileId: 1,
			saved: ["a"],
			kept: [],
		});

		expect(profiles.saveProfilePhotos).toHaveBeenCalledWith({
			cacheProfileId: 1,
			mediaHashes: [],
		});
	});
});
