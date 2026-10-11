import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { explainedPushError } from "./error-copy";

function pushFailure(reason: string) {
	return { kind: "Push", message: { reason, detail: null } };
}

const explanations: [reason: string, message: string][] = [
	[
		"addonOutdated",
		"The Open Grind FCM service is out of date. Update it to the latest version.",
	],
	[
		"addonHidden",
		"The Open Grind FCM service is hidden or frozen, for example by Ice Box or Hail. Unfreeze it.",
	],
	[
		"addonTurnedOff",
		"An app like Blocker or App Manager turned off part of the Open Grind FCM service. Turn it back on in that app.",
	],
	[
		"addonBlocked",
		"Android or another app stopped Open Grind from starting the Open Grind FCM service. Allow it to auto-start in your phone's settings, then try again.",
	],
	[
		"addonUnavailable",
		"Open Grind couldn't reach the Open Grind FCM service.",
	],
];

describe("explainedPushError", () => {
	afterEach(async () => {
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it.each(explanations)("names what to do about %s", (reason, message) => {
		const error = pushFailure(reason);

		const explained = explainedPushError(error);

		expect(explained).toBeInstanceOf(Error);
		expect((explained as Error).message).toBe(message);
		expect((explained as Error).cause).toBe(error);
	});

	it.each(explanations)(
		"keeps %s in English in another language",
		async (reason, message) => {
			await setLocale({ locale: "en-XA" });

			const explained = explainedPushError(pushFailure(reason));

			expect((explained as Error).message).toBe(message);
		},
	);

	it("passes a failure without a known reason through unchanged", () => {
		const error = pushFailure("failed");

		expect(explainedPushError(error)).toBe(error);
	});
});
