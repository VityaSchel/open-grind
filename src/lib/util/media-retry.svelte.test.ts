import { describe, expect, it } from "vitest";

import { mediaRetry } from "./media-retry.svelte";

describe("mediaRetry", () => {
	it("moves on every nudge", () => {
		const before = mediaRetry.generation;

		mediaRetry.nudge();
		mediaRetry.nudge();

		expect(mediaRetry.generation).toBe(before + 2);
	});
});
