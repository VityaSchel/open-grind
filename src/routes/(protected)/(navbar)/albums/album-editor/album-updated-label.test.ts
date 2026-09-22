import { afterEach, describe, expect, it } from "vitest";

import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import { albumUpdatedLabel } from "./album-updated-label";

afterEach(() => resetNowForTesting());

describe("albumUpdatedLabel", () => {
	it("omits the year within the current year", () => {
		setNowForTesting(() => new Date("2026-12-31T23:00:00").getTime());
		expect(albumUpdatedLabel("2026-09-09T14:03:11")).toBe("Sep 9");
	});

	it("spells out the year for an earlier one", () => {
		setNowForTesting(() => new Date("2026-01-01T00:30:00").getTime());
		expect(albumUpdatedLabel("2025-08-26T10:00:00")).toBe("Aug 26, 2025");
	});
});
