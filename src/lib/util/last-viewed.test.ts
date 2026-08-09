import { beforeEach, describe, expect, it } from "vitest";

import { lastViewedMarker } from "./last-viewed";

const marker = lastViewedMarker("test:last-viewed:");
const other = lastViewedMarker("test:other-last-viewed:");

beforeEach(() => {
	localStorage.clear();
});

describe("lastViewedMarker", () => {
	it("reads zero until a timestamp is stored for that profile", () => {
		marker.save({ profileId: 1, at: 1_710_000_000_000 });

		expect(marker.load(1)).toBe(1_710_000_000_000);
		expect(marker.load(2)).toBe(0);
	});

	it("rejects stored values that are not timestamps", () => {
		localStorage.setItem("test:last-viewed:1", "not-a-number");
		expect(marker.load(1)).toBe(0);

		localStorage.setItem("test:last-viewed:1", "-5");
		expect(marker.load(1)).toBe(0);
	});

	it("clears only its own prefix", () => {
		marker.save({ profileId: 1, at: 10 });
		other.save({ profileId: 1, at: 20 });

		marker.clearStored();

		expect(marker.load(1)).toBe(0);
		expect(other.load(1)).toBe(20);
	});
});
