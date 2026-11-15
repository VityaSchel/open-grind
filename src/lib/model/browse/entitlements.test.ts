import { afterEach, describe, expect, it, vi } from "vitest";

import {
	freeRightNowPostsLeft,
	rightNowPostEntitlementsResponseSchema,
} from "./entitlements";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("freeRightNowPostsLeft", () => {
	const freeLeft = (body: unknown) =>
		freeRightNowPostsLeft(
			rightNowPostEntitlementsResponseSchema.parse(body),
		);

	it("reads granted posts with a count", () => {
		expect(freeLeft({ type: "GRANTED", count: 3 })).toBe(3);
	});

	it("reads granted posts without a count as none left", () => {
		expect(freeLeft({ type: "GRANTED" })).toBe(0);
		expect(freeLeft({ type: "GRANTED", count: 0 })).toBe(0);
	});

	it("reads unlimited posts", () => {
		expect(freeLeft({ type: "UNLIMITED" })).toBe("unlimited");
	});

	it("reads an unknown type as an unknown count, leaving the decision to the server", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(
			rightNowPostEntitlementsResponseSchema.parse({ type: "TRIAL" })
				.type,
		).toBeNull();
		expect(freeLeft({ type: "TRIAL", count: 5 })).toBeNull();
	});

	it("never reads a negative count", () => {
		expect(freeLeft({ type: "GRANTED", count: -1 })).toBe(0);
	});
});
