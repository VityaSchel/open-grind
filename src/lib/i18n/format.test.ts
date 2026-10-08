import { afterEach, describe, expect, it, vi } from "vitest";

import { restoreCountFormatter } from "./fixtures/count-formatter";
import {
	type DatePresetName,
	formatDate,
	formatInteger,
	formatList,
	formatNumber,
	formatRange,
	isolate,
	type NumberPresetName,
} from "./format";
import { setCountFormatter, setLocale, SOURCE_LOCALE } from "./index";

afterEach(async () => {
	vi.restoreAllMocks();
	restoreCountFormatter();
	await setLocale({ locale: SOURCE_LOCALE });
});

const numberCases: Record<NumberPresetName, [number, string][]> = {
	distanceMeters: [
		[0, "0 m"],
		[0.49, "0 m"],
		[0.5, "1 m"],
		[12.5, "13 m"],
		[999.4, "999 m"],
		[-0.3, "0 m"],
		[-2.5, "-2 m"],
	],
	distanceKilometers: [
		[1, "1.0 km"],
		[1.15, "1.1 km"],
		[1.25, "1.3 km"],
		[1.2, "1.2 km"],
		[12.345, "12.3 km"],
		[1999.96, "2000.0 km"],
		[12_345.67, "12345.7 km"],
		[-0.04, "-0.0 km"],
	],
	distanceFeet: [
		[0, "0 ft"],
		[3937.0079, "3937 ft"],
		[5280.4, "5280 ft"],
	],
	distanceMiles: [
		[1, "1.0 mi"],
		[1.4913, "1.5 mi"],
		[1.05, "1.1 mi"],
		[2.25, "2.3 mi"],
		[6213.71, "6213.7 mi"],
	],
	radiusKilometers: [
		[0.5, "0.5 km"],
		[1, "1 km"],
		[50, "50 km"],
		[1000, "1000 km"],
	],
	radiusMiles: [
		[0.5, "0.5 mi"],
		[10, "10 mi"],
		[2.5, "2.5 mi"],
	],
	heightCentimeters: [
		[121, "121 cm"],
		[180.5, "181 cm"],
		[241.4, "241 cm"],
	],
	weightKilograms: [
		[41, "41 kg"],
		[79.8, "80 kg"],
		[1272.2, "1272 kg"],
	],
	weightPounds: [
		[1, "1 lb"],
		[176, "176 lb"],
		[1600, "1600 lb"],
	],
};

const dateCases: Record<DatePresetName, [Date, string][]> = {
	weekday: [
		[new Date(2026, 9, 5, 0, 0), "Monday"],
		[new Date(2026, 9, 11, 23, 59), "Sunday"],
		[new Date(1999, 11, 31, 12), "Friday"],
	],
	monthDay: [
		[new Date(2026, 8, 9, 14, 3), "Sep 9"],
		[new Date(2025, 0, 1), "Jan 1"],
		[new Date(2026, 11, 31, 23, 59), "Dec 31"],
	],
	monthDayYear: [
		[new Date(2025, 7, 26, 10), "Aug 26, 2025"],
		[new Date(1970, 0, 1), "Jan 1, 1970"],
		[new Date(2099, 4, 17), "May 17, 2099"],
	],
	weekdayMonthDay: [
		[new Date(2026, 9, 5, 9, 5), "Mon, Oct 5"],
		[new Date(2024, 1, 29), "Thu, Feb 29"],
		[new Date(2026, 5, 7), "Sun, Jun 7"],
	],
	monthYear: [
		[new Date(2026, 8, 1), "September 2026"],
		[new Date(2019, 4, 31, 23, 59), "May 2019"],
		[new Date(2030, 1, 1), "February 2030"],
	],
};

describe("number presets", () => {
	it.each(Object.entries(numberCases))(
		"%s prints today's English",
		(preset, cases) => {
			for (const [value, text] of cases) {
				expect(
					formatNumber({ value, preset: preset as NumberPresetName }),
				).toBe(text);
			}
		},
	);
});

describe("date presets", () => {
	it.each(Object.entries(dateCases))(
		"%s prints today's English",
		(preset, cases) => {
			for (const [date, text] of cases) {
				const name = preset as DatePresetName;
				expect(formatDate({ date, preset: name })).toBe(text);
				expect(formatDate({ date: date.getTime(), preset: name })).toBe(
					text,
				);
			}
		},
	);
});

describe("formatList", () => {
	it("joins with a comma in English, with no conjunction", () => {
		expect(formatList([])).toBe("");
		expect(formatList(["Top"])).toBe("Top");
		expect(formatList(["Top", "Bottom"])).toBe("Top, Bottom");
		expect(formatList(["Top", "Bottom", "Versatile"])).toBe(
			"Top, Bottom, Versatile",
		);
	});
});

describe("formatInteger", () => {
	it("prints plain English digits", () => {
		expect(formatInteger(50)).toBe("50");
		expect(formatInteger(1234)).toBe("1234");
	});

	it("uses the count formatter with the active locale", async () => {
		setCountFormatter(({ count, locale }) => `${locale}:${count}`);
		await setLocale({ locale: "en-XA" });
		expect(formatInteger(50)).toBe("en-XA:50");
	});
});

describe("formatRange", () => {
	it("puts a spaced hyphen between the bounds", () => {
		expect(formatRange({ min: "No min", max: "6'0\"" })).toBe(
			"No min - 6'0\"",
		);
	});
});

describe("formatter cache", () => {
	it("reuses the formatter for a locale and preset", () => {
		const NativeDateTimeFormat = Intl.DateTimeFormat;
		const construct = vi
			.spyOn(Intl, "DateTimeFormat")
			.mockImplementation(function (locales, options) {
				return new NativeDateTimeFormat(locales, options);
			});
		const date = new Date(2026, 8, 9);
		formatDate({ date, preset: "monthYear" });
		const built = construct.mock.calls.length;
		formatDate({ date, preset: "monthYear" });
		formatDate({ date, preset: "monthYear" });
		expect(built).toBeLessThanOrEqual(1);
		expect(construct.mock.calls.length).toBe(built);
	});

	it("follows the active locale on the next call", async () => {
		const date = new Date(2026, 8, 9);
		await setLocale({ locale: "ar-XB" });
		expect(formatDate({ date, preset: "monthDay" })).not.toBe("Sep 9");
		await setLocale({ locale: SOURCE_LOCALE });
		expect(formatDate({ date, preset: "monthDay" })).toBe("Sep 9");
	});
});

describe("pseudo-locales", () => {
	it("marks numbers and dates as formatted under en-XA", async () => {
		await setLocale({ locale: "en-XA" });
		expect(formatNumber({ value: 1200, preset: "distanceMeters" })).toBe(
			"⟦1200 m⟧",
		);
		expect(
			formatDate({ date: new Date(2026, 8, 9), preset: "monthDay" }),
		).toBe("⟦Sep 9⟧");
		expect(formatList(["⟦Ţöþ⟧", "⟦Ɓöţţöɱ⟧"])).toBe("⟦Ţöþ⟧, ⟦Ɓöţţöɱ⟧");
	});
});

describe("isolate", () => {
	it("leaves text alone in a left-to-right locale", async () => {
		expect(isolate("5'11\"")).toBe("5'11\"");
		await setLocale({ locale: "en-XA" });
		expect(isolate("5'11\"")).toBe("5'11\"");
	});

	it("wraps text in first-strong isolates in a right-to-left locale", async () => {
		await setLocale({ locale: "ar-XB" });
		expect(isolate("5'11\"")).toBe("⁨5'11\"⁩");
	});
});
