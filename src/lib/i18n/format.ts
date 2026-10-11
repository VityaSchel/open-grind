import {
	type FormatDistanceFn,
	formatDistanceStrict,
	type FormatDistanceToken,
} from "date-fns";

import { t } from "./index";
import {
	formatCount,
	getFormatLocales,
	getLocale,
	getTextDirection,
} from "./locale-state.svelte";
import { markFormatted } from "./pseudo";
import { SOURCE_LOCALE } from "./syntax";

type NumberPreset = {
	readonly options: Intl.NumberFormatOptions;
	readonly round: (value: number) => number;
};

const unitStyle = { style: "unit", useGrouping: false } as const;

function whole(unit: string): NumberPreset {
	return {
		options: {
			...unitStyle,
			unit,
			maximumFractionDigits: 0,
			signDisplay: "negative",
		},
		round: Math.round,
	};
}

function fixed({
	unit,
	digits,
}: {
	unit: string;
	digits: number;
}): NumberPreset {
	return {
		options: {
			...unitStyle,
			unit,
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		},
		round: (value) => Number(value.toFixed(digits)),
	};
}

function narrow(unit: string): NumberPreset {
	const { options, round } = whole(unit);
	return { options: { ...options, unitDisplay: "narrow" }, round };
}

function asGiven(unit: string): NumberPreset {
	return {
		options: { ...unitStyle, unit, signDisplay: "negative" },
		round: (value) => value,
	};
}

const numberPresets = {
	distanceMeters: whole("meter"),
	distanceKilometers: fixed({ unit: "kilometer", digits: 1 }),
	distanceFeet: whole("foot"),
	distanceMiles: fixed({ unit: "mile", digits: 1 }),
	radiusKilometers: asGiven("kilometer"),
	radiusMiles: asGiven("mile"),
	heightCentimeters: whole("centimeter"),
	weightKilograms: whole("kilogram"),
	weightPounds: whole("pound"),
	durationSeconds: narrow("second"),
	sizeMegabytes: fixed({ unit: "megabyte", digits: 2 }),
} as const satisfies Record<string, NumberPreset>;

const datePresets = {
	weekday: { weekday: "long" },
	monthDay: { month: "short", day: "numeric" },
	monthDayYear: { month: "short", day: "numeric", year: "numeric" },
	weekdayMonthDay: { weekday: "short", month: "short", day: "numeric" },
	monthYear: { month: "long", year: "numeric" },
	dayMonthYear: { day: "numeric", month: "long", year: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

type DistanceUnitToken = Extract<FormatDistanceToken, `x${string}`>;

const distanceUnits = {
	xSeconds: "second",
	xMinutes: "minute",
	xHours: "hour",
	xDays: "day",
	xWeeks: "week",
	xMonths: "month",
	xYears: "year",
} as const satisfies Record<DistanceUnitToken, Intl.RelativeTimeFormatUnit>;

export type NumberPresetName = keyof typeof numberPresets;
export type DatePresetName = keyof typeof datePresets;

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const listFormats = new Map<string, Intl.ListFormat>();
const relativeTimeFormats = new Map<string, Intl.RelativeTimeFormat>();

function cachedFormatter<Formatter>({
	cache,
	locale,
	preset,
	create,
}: {
	cache: Map<string, Formatter>;
	locale: string;
	preset: string;
	create: (locales: string[]) => Formatter;
}): Formatter {
	const key = `${locale} ${preset}`;
	const known = cache.get(key);
	if (known !== undefined) return known;
	const formatter = create([locale, SOURCE_LOCALE]);
	cache.set(key, formatter);
	return formatter;
}

export function formatNumber({
	value,
	preset,
}: {
	value: number;
	preset: NumberPresetName;
}): string {
	const { options, round } = numberPresets[preset];
	const { text: locale, decimal, group } = getFormatLocales();
	const formatter = cachedFormatter({
		cache: numberFormats,
		locale,
		preset,
		create: (locales) => new Intl.NumberFormat(locales, options),
	});
	const text = formatter
		.formatToParts(round(value))
		.map((part) =>
			part.type === "decimal"
				? decimal
				: part.type === "group"
					? group
					: part.value,
		)
		.join("");
	return markFormatted({ locale: getLocale(), text });
}

export function formatInteger(value: number): string {
	return formatCount({ count: value, locales: getFormatLocales() });
}

export function formatDate({
	date,
	preset,
}: {
	date: Date | number;
	preset: DatePresetName;
}): string {
	const formatter = cachedFormatter({
		cache: dateFormats,
		locale: getFormatLocales().dates,
		preset,
		create: (locales) =>
			new Intl.DateTimeFormat(locales, datePresets[preset]),
	});
	return markFormatted({ locale: getLocale(), text: formatter.format(date) });
}

function zeroDigit(locale: string): string {
	return cachedFormatter({
		cache: numberFormats,
		locale,
		preset: "zeroDigit",
		create: (locales) => new Intl.NumberFormat(locales),
	}).format(0);
}

export function formatClockTime(date: Date | number): string {
	const { text: locale, twoDigitHour } = getFormatLocales();
	const hour = twoDigitHour ? "2-digit" : "numeric";
	const formatter = cachedFormatter({
		cache: dateFormats,
		locale,
		preset: `clockTime ${hour}`,
		create: (locales) =>
			new Intl.DateTimeFormat(locales, { hour, minute: "2-digit" }),
	});
	const text = formatter.format(date);
	if (twoDigitHour) return markFormatted({ locale: getLocale(), text });
	const hours =
		formatter.formatToParts(date).find(({ type }) => type === "hour")
			?.value ?? "";
	const [first, ...rest] = hours;
	const unpadded =
		rest.length === 1 && first === zeroDigit(locale)
			? text.replace(hours, rest.join(""))
			: text;
	return markFormatted({ locale: getLocale(), text: unpadded });
}

export function formatRelativeTime({
	date,
	baseDate,
}: {
	date: Date | number;
	baseDate: Date | number;
}): string {
	const formatter = cachedFormatter({
		cache: relativeTimeFormats,
		locale: getFormatLocales().text,
		preset: "always",
		create: (locales) =>
			new Intl.RelativeTimeFormat(locales, { numeric: "always" }),
	});
	const formatDistance: FormatDistanceFn = (token, count, options) =>
		formatter
			.formatToParts(
				(options?.comparison ?? 0) > 0 ? count : -count,
				distanceUnits[token as DistanceUnitToken],
			)
			.filter((part) => part.type !== "group")
			.map((part) => part.value)
			.join("");
	const text = formatDistanceStrict(date, baseDate, {
		addSuffix: true,
		locale: { formatDistance },
	});
	return markFormatted({ locale: getLocale(), text });
}

function listFormat(): Intl.ListFormat {
	return cachedFormatter({
		cache: listFormats,
		locale: getLocale(),
		preset: "unitShort",
		create: (locales) =>
			new Intl.ListFormat(locales, { type: "unit", style: "short" }),
	});
}

export function formatList(items: readonly string[]): string {
	return listFormat().format(items);
}

export type ListPart = { type: "element" | "literal"; value: string };

export function formatListParts(items: readonly string[]): ListPart[] {
	return listFormat().formatToParts(items);
}

export function formatRange({
	min,
	max,
}: {
	min: string;
	max: string;
}): string {
	return t("common.format.range", { min, max });
}

export function isolate(text: string): string {
	return getTextDirection() === "rtl" ? `\u2068${text}\u2069` : text;
}
