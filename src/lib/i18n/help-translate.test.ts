import { describe, expect, it } from "vitest";

import { helpTranslateUrl } from "./help-translate";

const ENGAGE_PAGE = "https://i18n.opengrind.org/engage/open-grind/";

describe("the help translate link", () => {
	it.each([
		[["de-AT", "fr-FR"], "de"],
		[["pt"], "pt-BR"],
		[["pt-AO"], "pt-PT"],
		[["es-MX"], "es-419"],
		[["zh-TW"], "zh-Hant"],
		[["zh_CN.UTF-8"], "zh-Hans"],
		[["nn-NO"], "nb"],
		[["en-AU"], "en-GB"],
	])("opens the page of the first system language %j", (system, catalog) => {
		expect(helpTranslateUrl({ system })).toBe(
			`${ENGAGE_PAGE}-/${catalog}/`,
		);
	});

	it.each([
		[["en-US", "de-DE"]],
		[["sw-KE", "de-DE"]],
		[["en-XA"]],
		[["hi-Latn"]],
		[[]],
	])(
		"opens the project page for a first system language %j without a translation",
		(system) => {
			expect(helpTranslateUrl({ system })).toBe(ENGAGE_PAGE);
		},
	);
});
