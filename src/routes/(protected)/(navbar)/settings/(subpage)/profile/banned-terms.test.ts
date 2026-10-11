// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import type { ModeratedField } from "$lib/api/users/profile-moderation";
import { bannedTermsDetail } from "./banned-terms";

afterEach(async () => {
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("banned terms detail", () => {
	it("names each field as the editor labels it and lists its terms", () => {
		expect(
			bannedTermsDetail([
				{ field: "display_name", terms: ["alpha", "beta"] },
				{ field: "about_me", terms: ["gamma"] },
				{ field: "gender_display", terms: ["delta"] },
				{
					field: "pronouns_display",
					terms: ["epsilon", "zeta", "eta"],
				},
			]),
		).toBe(
			"Display name: alpha, beta; About me: gamma; Gender: delta; Pronouns: epsilon, zeta, eta",
		);
	});

	it("is empty when no field was rejected", () => {
		expect(bannedTermsDetail([])).toBe("");
	});

	it("words the field name in the active locale and keeps the terms as sent", async () => {
		await setLocale({ locale: "en-XA" });

		const detail = bannedTermsDetail([
			{ field: "display_name", terms: ["alpha"] },
		]);

		expect(detail).toMatch(PSEUDO_MESSAGE);
		expect(detail).toContain("alpha");
		expect(detail).not.toContain("Display name");
	});

	it("joins the fields as the active locale words the joining", async () => {
		await setLocale({ locale: "en-XA" });
		const fields: ModeratedField[] = [
			{ field: "display_name", terms: ["alpha"] },
			{ field: "about_me", terms: ["gamma"] },
		];
		const [first, second] = fields.map((field) =>
			bannedTermsDetail([field]),
		);

		const detail = bannedTermsDetail(fields);
		const joined = `⟦${first}; ${second}`;

		expect(detail).toMatch(PSEUDO_MESSAGE);
		expect(detail.slice(0, joined.length)).toBe(joined);
	});
});
