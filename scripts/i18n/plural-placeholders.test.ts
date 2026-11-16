import { describe, expect, it } from "vitest";

import { SOURCE_LOCALE } from "../../src/lib/i18n/syntax";
import { LOCALES, readLocaleFiles, sourceFile } from "./locale-files";
import {
	ALLOWED_PLURAL_PLACEHOLDERS,
	checkPluralPlaceholders,
} from "./plural-placeholders";
import { catalogTexts } from "./source-messages";

const check = (json: unknown) =>
	checkPluralPlaceholders({
		texts: catalogTexts([sourceFile(json)]),
		allowed: {},
	});

const unagreeing = (key: string, name: string) =>
	`en/${key}: its plural forms follow {{count}} alone, so no word can agree with {{${name}}}; give each number its own plural message keyed by {{count}}, or allow {{${name}}} in scripts/i18n/plural-placeholders.ts with the reason`;

describe("checkPluralPlaceholders", () => {
	it("fails on a plural that words of a second number agree with", () => {
		expect(
			check({
				truncated_one:
					"Showing the first {{shown}} of {{count}} match. Keep typing to narrow the results.",
				truncated_other:
					"Showing the first {{shown}} of {{count}} matches. Keep typing to narrow the results.",
				leftOut_one:
					"{{count}} left out, a profile holds up to {{max}} photos",
				leftOut_other:
					"{{count}} left out, a profile holds up to {{max}} photos",
			}),
		).toEqual([
			unagreeing("ns.truncated", "shown"),
			unagreeing("ns.leftOut", "max"),
		]);
	});

	it("passes a plural message per number, each keyed by {{count}}", () => {
		expect(
			check({
				truncated: {
					matches_one: "{{count}} tag matches.",
					matches_other: "{{count}} tags match.",
					shown_one:
						"Showing the first {{count}}. Keep typing to narrow the results.",
					shown_other:
						"Showing the first {{count}}. Keep typing to narrow the results.",
				},
				leftOut: {
					title_one: "{{count}} photo left out",
					title_other: "{{count}} photos left out",
					description_one: "A profile holds up to {{count}} photo.",
					description_other:
						"A profile holds up to {{count}} photos.",
				},
			}),
		).toEqual([]);
	});

	it("leaves placeholders of messages without plural forms alone", () => {
		expect(check({ range: "{{min}}–{{max}}" })).toEqual([]);
	});

	it("names a placeholder once even when only one plural form holds it", () => {
		expect(
			check({
				byline_one: "One photo by {{author}}",
				byline_other: "{{count}} photos",
			}),
		).toEqual([unagreeing("ns.byline", "author")]);
	});

	it("passes a placeholder that is allowed for its message", () => {
		expect(
			checkPluralPlaceholders({
				texts: catalogTexts([
					sourceFile({
						selected_one: "{{count}}/{{max}} selected",
						selected_other: "{{count}}/{{max}} selected",
					}),
				]),
				allowed: { "ns.selected": { max: "no word agrees with it" } },
			}),
		).toEqual([]);
	});

	it("fails on an allowed placeholder that no plural message holds", () => {
		expect(
			checkPluralPlaceholders({
				texts: catalogTexts([
					sourceFile({
						selected_one: "{{count}} selected",
						selected_other: "{{count}} selected",
						range: "{{min}}–{{max}}",
					}),
				]),
				allowed: {
					"ns.selected": { max: "no word agrees with it" },
					"ns.range": { max: "no word agrees with it" },
				},
			}),
		).toEqual([
			"scripts/i18n/plural-placeholders.ts: ns.selected has no plural message with {{max}}; remove the entry",
			"scripts/i18n/plural-placeholders.ts: ns.range has no plural message with {{max}}; remove the entry",
		]);
	});

	it("passes the English catalog with every allowed placeholder in use", () => {
		const source = readLocaleFiles(LOCALES).get(SOURCE_LOCALE) ?? [];

		expect(
			checkPluralPlaceholders({
				texts: catalogTexts(source),
				allowed: ALLOWED_PLURAL_PLACEHOLDERS,
			}),
		).toEqual([]);
	});
});
