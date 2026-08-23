import { beforeEach, describe, expect, it } from "vitest";

import { AlbumShareRegistry } from "./album-shares.svelte";

const ALBUM = 901;
const PEER = 100001;

let registry: AlbumShareRegistry;

beforeEach(() => {
	registry = new AlbumShareRegistry();
});

describe("AlbumShareRegistry", () => {
	it("knows nothing about an album until its share list is recorded", () => {
		expect(registry.isResolved(ALBUM)).toBe(false);
		expect(
			registry.isSharedWith({ albumId: ALBUM, profileId: PEER }),
		).toBeUndefined();

		registry.record({ albumId: ALBUM, profileIds: [PEER] });

		expect(registry.isResolved(ALBUM)).toBe(true);
		expect(registry.isSharedWith({ albumId: ALBUM, profileId: PEER })).toBe(
			true,
		);
		expect(
			registry.isSharedWith({ albumId: ALBUM, profileId: PEER + 1 }),
		).toBe(false);
	});

	it("toggles one profile without touching the rest of the list", () => {
		registry.record({ albumId: ALBUM, profileIds: [PEER, PEER + 1] });

		registry.set({ albumId: ALBUM, profileId: PEER, shared: false });
		expect(registry.isSharedWith({ albumId: ALBUM, profileId: PEER })).toBe(
			false,
		);
		expect(
			registry.isSharedWith({ albumId: ALBUM, profileId: PEER + 1 }),
		).toBe(true);

		registry.set({ albumId: ALBUM, profileId: PEER, shared: true });
		expect(registry.isSharedWith({ albumId: ALBUM, profileId: PEER })).toBe(
			true,
		);
	});

	it("resolves an album on a bare set and forgets everything on clear", () => {
		registry.set({ albumId: ALBUM, profileId: PEER, shared: true });
		expect(registry.isResolved(ALBUM)).toBe(true);

		registry.clear();
		expect(registry.isResolved(ALBUM)).toBe(false);
	});
});
