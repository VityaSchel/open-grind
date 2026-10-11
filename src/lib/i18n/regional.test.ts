import { describe, expect, it, vi } from "vitest";

import {
	composeFormatLocales,
	parseRegionalOverride,
	parseRegionalTag,
	type RegionalSettings,
	regionalSettingsSchema,
	webRegionalSettings,
} from "./regional";

function compose({
	language,
	...regional
}: { language: string } & RegionalSettings) {
	return composeFormatLocales({ language, regional });
}

function dateOrderOf(tag: string): string {
	return new Intl.DateTimeFormat(tag, {
		year: "numeric",
		month: "numeric",
		day: "numeric",
	})
		.formatToParts(new Date(2001, 1, 3))
		.filter(({ type }) => ["year", "month", "day"].includes(type))
		.map(({ type }) => type.charAt(0))
		.join("");
}

describe("composeFormatLocales", () => {
	it.each([
		["en", "de-DE", "en-u-hc-h23", "en-DE-u-hc-h23"],
		["en", "de", "en-u-hc-h23", "en-DE-u-hc-h23"],
		["en-GB", "en-US", "en-GB-u-hc-h12", "en-US-u-hc-h12"],
		["es-419", "es-MX", "es-419-u-hc-h12", "es-MX-u-hc-h12"],
		["pt-BR", "pt-PT", "pt-BR-u-hc-h23", "pt-PT-u-hc-h23"],
		["en", "fr-CA", "en-u-hc-h23", "en-CA-u-hc-h23"],
		["ja", "ja-JP", "ja-u-hc-h23", "ja-JP-u-hc-h23"],
		["ru", "en-US", "ru-u-hc-h12", "ru-u-hc-h12"],
		["en", "en-001-u-rg-eszzzz", "en-u-hc-h23", "en-ES-u-hc-h23"],
	])(
		"words %s on a %s system as %s and dates it as %s",
		(language, locale, text, dates) => {
			expect(compose({ language, locale })).toMatchObject({
				text,
				dates,
			});
		},
	);

	it("drops a language-region pair that no formatter has, though supportedLocalesOf lists it", () => {
		expect(Intl.DateTimeFormat.supportedLocalesOf(["ru-US"])).toEqual([
			"ru-US",
		]);
		expect(compose({ language: "ru", locale: "en-US" }).dates).toBe(
			"ru-u-hc-h12",
		);
	});

	it("falls back to a language variant with the system's date order", () => {
		const { dates } = compose({ language: "en", locale: "ru-RU" });

		expect(dateOrderOf(dates)).toBe("dmy");
		expect(new Intl.Locale(dates).hourCycle).toBe("h23");
		expect(new Intl.Locale(dates).language).toBe("en");
	});

	it("follows a date order the platform reports", () => {
		const { dates } = compose({
			language: "en",
			locale: "en-US",
			dateOrder: "dmy",
		});

		expect(dates).toBe("en-001-u-hc-h12");
		expect(dateOrderOf(dates)).toBe("dmy");
	});

	it.each(["und", "C", "POSIX", "", "en_US.UTF-8", "%%%"])(
		"formats as the language when the system locale is %j",
		(locale) => {
			expect(compose({ language: "en", locale })).toEqual({
				text: "en",
				dates: "en",
				twoDigitHour: false,
				decimal: ".",
				group: ",",
			});
		},
	);

	it("keeps a platform hour cycle without a system locale", () => {
		expect(
			compose({ language: "en", locale: "C", hourCycle: "h23" }),
		).toMatchObject({ text: "en-u-hc-h23", dates: "en-u-hc-h23" });
	});

	it("takes the hour cycle from the platform, then the tag, then the region", () => {
		expect(compose({ language: "en", locale: "de-DE-u-hc-h12" }).text).toBe(
			"en-u-hc-h12",
		);
		expect(
			compose({
				language: "en",
				locale: "de-DE-u-hc-h12",
				hourCycle: "h11",
			}).text,
		).toBe("en-u-hc-h11");
		expect(
			compose({ language: "en", locale: "en-US", hourCycle: "h23" }).text,
		).toBe("en-u-hc-h23");
	});

	it("pads the hour as the platform or the system region does, whatever the language", () => {
		expect(
			compose({ language: "en", locale: "de-DE", twoDigitHour: true })
				.twoDigitHour,
		).toBe(true);
		expect(
			compose({ language: "de", locale: "en-US", twoDigitHour: false })
				.twoDigitHour,
		).toBe(false);
		for (const language of ["en", "de", "ar", "ja"]) {
			expect(compose({ language, locale: "de-DE" }).twoDigitHour).toBe(
				false,
			);
			expect(
				compose({ language, locale: "en-US", hourCycle: "h23" })
					.twoDigitHour,
			).toBe(true);
		}
	});

	it("uses an explicitly chosen numbering system with its own symbols", () => {
		const arabic = {
			text: "en-u-hc-h23-nu-arab",
			dates: "en-DE-u-hc-h23-nu-arab",
			decimal: "٫",
			group: "٬",
		};

		expect(
			compose({
				language: "en",
				locale: "de-DE",
				numberingSystem: "arab",
			}),
		).toMatchObject(arabic);
		expect(
			compose({ language: "en", locale: "de-DE-u-nu-arab" }),
		).toMatchObject(arabic);
		expect(
			compose({
				language: "en",
				locale: "de-DE",
				numberingSystem: "ARAB",
				decimalSeparator: ".",
				groupSeparator: " ",
			}),
		).toMatchObject(arabic);
	});

	it("keeps the language's own digits when the system region writes others by default", () => {
		expect(compose({ language: "ar", locale: "ar-EG" })).toMatchObject({
			text: "ar-u-hc-h12",
			dates: "ar-EG-u-hc-h12-nu-latn",
			decimal: ".",
			group: ",",
		});
		expect(
			compose({
				language: "ar",
				locale: "ar-EG",
				numberingSystem: "arab",
			}),
		).toMatchObject({
			text: "ar-u-hc-h12-nu-arab",
			dates: "ar-EG-u-hc-h12",
			decimal: "٫",
			group: "٬",
		});
	});

	it.each(["bogus", "x", "latn-arab"])(
		"ignores the numbering system %j that no formatter has",
		(numberingSystem) => {
			expect(
				compose({ language: "en", locale: "de-DE", numberingSystem }),
			).toMatchObject({ text: "en-u-hc-h23", dates: "en-DE-u-hc-h23" });
		},
	);

	it("takes separators from the system region", () => {
		expect(compose({ language: "en", locale: "de-DE" })).toMatchObject({
			decimal: ",",
			group: ".",
		});
		expect(compose({ language: "de", locale: "en-US" })).toMatchObject({
			text: "de-u-hc-h12",
			decimal: ".",
			group: ",",
		});
	});

	it("takes separators from the number locale when the system splits them", () => {
		expect(
			compose({ language: "en", locale: "en-US", numberLocale: "de-DE" }),
		).toMatchObject({ text: "en-u-hc-h12", decimal: ",", group: "." });
	});

	it("prefers the platform's own separators for Latin digits", () => {
		expect(
			compose({
				language: "en",
				locale: "en-US",
				decimalSeparator: ",",
				groupSeparator: " ",
			}),
		).toMatchObject({ text: "en-u-hc-h12", decimal: ",", group: " " });
		expect(
			compose({
				language: "en",
				locale: "ar-EG",
				numberingSystem: "latn",
				decimalSeparator: ",",
				groupSeparator: " ",
			}),
		).toMatchObject({ decimal: ",", group: " " });
	});

	it.each([
		["en", "ar-EG"],
		["ru", "fa-IR"],
	])(
		"keeps Latin separators for %s on a %s system whose own digits are not Latin",
		(language, locale) => {
			expect(
				compose({
					language,
					locale,
					decimalSeparator: "٫",
					groupSeparator: "٬",
				}),
			).toMatchObject({ decimal: ".", group: "," });
		},
	);
});

describe("regionalSettingsSchema", () => {
	it("drops each field it cannot read and keeps the rest", () => {
		expect(
			regionalSettingsSchema.parse({
				locale: "de-DE",
				numberLocale: 1,
				hourCycle: "h25",
				dateOrder: "dym",
				decimalSeparator: "",
				groupSeparator: ".",
				numberingSystem: 5,
				firstDayOfWeek: 9,
				measurementSystem: "imperial",
				extra: true,
			}),
		).toEqual({ locale: "de-DE", groupSeparator: "." });
	});

	it("rejects a snapshot without a locale", () => {
		expect(
			regionalSettingsSchema.safeParse({ hourCycle: "h23" }).success,
		).toBe(false);
	});
});

describe("webRegionalSettings", () => {
	it("reads the browser's language", () => {
		vi.spyOn(navigator, "language", "get").mockReturnValue("de-AT");

		expect(webRegionalSettings()).toEqual({ locale: "de-AT" });
		vi.restoreAllMocks();
	});
});

describe("parseRegionalTag", () => {
	it("reads hour cycle, digits, first weekday and measurement keywords", () => {
		expect(
			parseRegionalTag("de-DE-u-hc-h12-nu-arab-fw-sun-ms-ussystem"),
		).toEqual({
			locale: "de-DE-u-fw-sun-hc-h12-ms-ussystem-nu-arab",
			hourCycle: "h12",
			numberingSystem: "arab",
			firstDayOfWeek: 7,
			measurementSystem: "us",
		});
		expect(parseRegionalTag("en-GB-u-fw-mon-ms-uksystem")).toEqual({
			locale: "en-GB-u-fw-mon-ms-uksystem",
			firstDayOfWeek: 1,
			measurementSystem: "uk",
		});
		expect(parseRegionalTag("fr-FR-u-ms-metric")).toEqual({
			locale: "fr-FR-u-ms-metric",
			measurementSystem: "metric",
		});
	});

	it.each(["not a tag", "POSIX", "und"])("reads nothing from %j", (tag) => {
		expect(parseRegionalTag(tag)).toBeUndefined();
	});
});

describe("parseRegionalOverride", () => {
	it("reads a tag or a JSON snapshot", () => {
		expect(parseRegionalOverride("de-DE")).toEqual({ locale: "de-DE" });
		expect(
			parseRegionalOverride('{"locale":"de-DE","hourCycle":"h12"}'),
		).toEqual({ locale: "de-DE", hourCycle: "h12" });
	});

	it.each(['{"hourCycle":"h12"}', "{", "[]", ""])(
		"reads nothing from %j",
		(value) => {
			expect(parseRegionalOverride(value)).toBeUndefined();
		},
	);
});
