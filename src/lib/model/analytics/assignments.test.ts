import { describe, expect, it } from "vitest";

import { assignmentsResponseSchema } from "#lib/model/analytics/assignments.ts";

const flag = {
	key: "right-now-moderation",
	value: "on",
	payload: { rollout: 1 },
	type: "FEATURE_FLAG",
};

describe("assignmentsResponseSchema", () => {
	it.each([{}, { assignments: null }])(
		"reads %j as no assignments",
		(body) => {
			expect(assignmentsResponseSchema.parse(body).assignments).toEqual(
				[],
			);
		},
	);

	it("keeps the assignments around one without a key", () => {
		const consent = { ...flag, key: "ai-consent-2026", value: null };

		expect(
			assignmentsResponseSchema.parse({
				assignments: [flag, { value: "on" }, consent],
			}).assignments,
		).toEqual([flag, consent]);
	});

	it("keeps an assignment that arrives without payload or type", () => {
		expect(
			assignmentsResponseSchema.parse({
				assignments: [{ key: flag.key, value: "on" }],
			}).assignments,
		).toEqual([{ key: flag.key, value: "on", payload: null, type: null }]);
	});

	it("still rejects assignments that are not a list", () => {
		expect(
			assignmentsResponseSchema.safeParse({ assignments: flag }).success,
		).toBe(false);
	});
});
