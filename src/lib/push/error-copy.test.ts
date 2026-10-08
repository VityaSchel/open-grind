import { describe, expect, it } from "vitest";

import { explainedPushError } from "./error-copy";

function pushFailure(reason: string) {
	return { kind: "Push", message: { reason, detail: null } };
}

describe("explainedPushError", () => {
	it.each([
		[
			"addonOutdated",
			"The FCM service is out of date. Update it to the latest version.",
		],
		[
			"addonHidden",
			"The FCM service is hidden or frozen, for example by Ice Box or Hail. Unfreeze it.",
		],
		[
			"addonTurnedOff",
			"An app like Blocker or App Manager turned off part of the FCM service. Turn it back on in that app.",
		],
		[
			"addonBlocked",
			"Android or another app stopped Open Grind from starting the FCM service. Allow it to auto-start in your phone's settings, then try again.",
		],
		["addonUnavailable", "Open Grind couldn't reach the FCM service."],
	])("names what to do about %s", (reason, message) => {
		const error = pushFailure(reason);

		const explained = explainedPushError(error);

		expect(explained).toBeInstanceOf(Error);
		expect((explained as Error).message).toBe(message);
		expect((explained as Error).cause).toBe(error);
	});

	it("passes a failure without a known reason through unchanged", () => {
		const error = pushFailure("failed");

		expect(explainedPushError(error)).toBe(error);
	});
});
