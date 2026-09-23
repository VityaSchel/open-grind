import { describe, expect, it } from "vitest";

import type { LazyGridProfile } from "./grid";
import { dedupeGridProfiles, indexProfilesById } from "./grid-profiles";
import { rendered } from "./grid-test-helpers";

function lazy(id: number): LazyGridProfile {
	return { type: "lazy", id, unread: null, isVisiting: false };
}

describe("dedupeGridProfiles", () => {
	it("keeps the first occurrence of a rendered profile in place", () => {
		const first = { ...rendered({ id: 2 }), displayName: "First" };
		const profiles = dedupeGridProfiles([
			rendered({ id: 1 }),
			first,
			rendered({ id: 3 }),
			{ ...rendered({ id: 2 }), displayName: "Second" },
		]);

		expect(profiles).toEqual([
			rendered({ id: 1 }),
			first,
			rendered({ id: 3 }),
		]);
	});

	it("lets a rendered row replace a lazy one at the lazy row's position", () => {
		const profiles = dedupeGridProfiles([
			lazy(1),
			rendered({ id: 2 }),
			rendered({ id: 1 }),
		]);

		expect(profiles).toEqual([rendered({ id: 1 }), rendered({ id: 2 })]);
	});

	it("never lets a lazy row replace a rendered one", () => {
		const profiles = dedupeGridProfiles([
			rendered({ id: 1 }),
			rendered({ id: 2 }),
			lazy(1),
		]);

		expect(profiles).toEqual([rendered({ id: 1 }), rendered({ id: 2 })]);
	});
});

describe("indexProfilesById", () => {
	it("maps each id to its position", () => {
		const index = indexProfilesById([
			rendered({ id: 7 }),
			lazy(3),
			rendered({ id: 5 }),
		]);

		expect([...index]).toEqual([
			[7, 0],
			[3, 1],
			[5, 2],
		]);
	});
});
