import { t } from "./index";
import {
	formatCount,
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

function tenths(unit: string): NumberPreset {
	return {
		options: {
			...unitStyle,
			unit,
			minimumFractionDigits: 1,
			maximumFractionDigits: 1,
		},
		round: (value) => Number(value.toFixed(1)),
	};
}

function asGiven(unit: string): NumberPreset {
	return {
		options: { ...unitStyle, unit, signDisplay: "negative" },
		round: (value) => value,
	};
}

const numberPresets = {
	distanceMeters: whole("meter"),
	distanceKilometers: tenths("kilometer"),
	distanceFeet: whole("foot"),
	distanceMiles: tenths("mile"),
	radiusKilometers: asGiven("kilometer"),
	radiusMiles: asGiven("mile"),
	heightCentimeters: whole("centimeter"),
	weightKilograms: whole("kilogram"),
	weightPounds: whole("pound"),
} as const satisfies Record<string, NumberPreset>;

const datePresets = {
	weekday: { weekday: "long" },
	monthDay: { month: "short", day: "numeric" },
	monthDayYear: { month: "short", day: "numeric", year: "numeric" },
	weekdayMonthDay: { weekday: "short", month: "short", day: "numeric" },
	monthYear: { month: "long", year: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type NumberPresetName = keyof typeof numberPresets;
export type DatePresetName = keyof typeof datePresets;

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const listFormats = new Map<string, Intl.ListFormat>();

function cachedFormatter<Formatter>({
	cache,
	preset,
	create,
}: {
	cache: Map<string, Formatter>;
	preset: string;
	create: (locales: string[]) => Formatter;
}): Formatter {
	const locale = getLocale();
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
	const formatter = cachedFormatter({
		cache: numberFormats,
		preset,
		create: (locales) => new Intl.NumberFormat(locales, options),
	});
	const text = formatter.format(round(value));
	return markFormatted({ locale: getLocale(), text });
}

export function formatInteger(value: number): string {
	return formatCount({ count: value, locale: getLocale() });
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
		preset,
		create: (locales) =>
			new Intl.DateTimeFormat(locales, datePresets[preset]),
	});
	return markFormatted({ locale: getLocale(), text: formatter.format(date) });
}

export function formatList(items: readonly string[]): string {
	return cachedFormatter({
		cache: listFormats,
		preset: "unitShort",
		create: (locales) =>
			new Intl.ListFormat(locales, { type: "unit", style: "short" }),
	}).format(items);
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
