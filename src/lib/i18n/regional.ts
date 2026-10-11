import z from "zod";

const hourCycles = ["h11", "h12", "h23", "h24"] as const;
const dateOrders = ["dmy", "mdy", "ymd"] as const;
const measurementSystems = ["metric", "us", "uk"] as const;

const isoWeekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const measurementKeywords: Readonly<Record<string, MeasurementSystem>> = {
	metric: "metric",
	ussystem: "us",
	uksystem: "uk",
};

const UNSPECIFIED_LANGUAGES = new Set(["c", "posix", "und"]);

const SUBDIVISION = /^([a-z]{2}|\d{3})[a-z\d]{1,4}$/;

const SAMPLE_DATE = new Date(2001, 1, 3);
const SAMPLE_MORNING = new Date(2001, 1, 3, 9, 5);
const SAMPLE_NUMBER = 1234567.5;

export const regionalSettingsSchema = z.object({
	locale: z.string(),
	numberLocale: z.string().optional().catch(undefined),
	hourCycle: z.enum(hourCycles).optional().catch(undefined),
	twoDigitHour: z.boolean().optional().catch(undefined),
	dateOrder: z.enum(dateOrders).optional().catch(undefined),
	decimalSeparator: z.string().min(1).optional().catch(undefined),
	groupSeparator: z.string().min(1).optional().catch(undefined),
	numberingSystem: z.string().optional().catch(undefined),
	firstDayOfWeek: z.int().min(1).max(7).optional().catch(undefined),
	measurementSystem: z.enum(measurementSystems).optional().catch(undefined),
});

export type RegionalSettings = z.infer<typeof regionalSettingsSchema>;
export type DateOrder = (typeof dateOrders)[number];
export type MeasurementSystem = (typeof measurementSystems)[number];

export type FormatLocales = {
	readonly text: string;
	readonly dates: string;
	readonly twoDigitHour: boolean;
	readonly decimal: string;
	readonly group: string;
};

function systemLocale(tag: string | undefined): Intl.Locale | undefined {
	if (tag === undefined) return undefined;
	try {
		const locale = new Intl.Locale(tag);
		const [language = ""] = locale.toString().split("-");
		return UNSPECIFIED_LANGUAGES.has(language) ? undefined : locale;
	} catch {
		return undefined;
	}
}

function unicodeKeywords(locale: Intl.Locale): Map<string, string> {
	const keywords = new Map<string, string>();
	let inExtension = false;
	let key: string | undefined;
	for (const subtag of locale.toString().toLowerCase().split("-").slice(1)) {
		if (subtag.length === 1) {
			if (inExtension) break;
			inExtension = subtag === "u";
		} else if (inExtension && subtag.length === 2) {
			key = subtag;
			keywords.set(key, "");
		} else if (inExtension && key !== undefined) {
			const value = keywords.get(key);
			keywords.set(key, value ? `${value}-${subtag}` : subtag);
		}
	}
	return keywords;
}

function regionOf(locale: Intl.Locale): string | undefined {
	const [, override] =
		SUBDIVISION.exec(unicodeKeywords(locale).get("rg") ?? "") ?? [];
	return override?.toUpperCase() ?? locale.region ?? locale.maximize().region;
}

function withOwnRegion(locale: Intl.Locale): Intl.Locale {
	return new Intl.Locale(locale.baseName, { region: regionOf(locale) });
}

function isDateOrder(order: string): order is DateOrder {
	return (dateOrders as readonly string[]).includes(order);
}

function numericDateOrder(tag: string): DateOrder | undefined {
	const order = new Intl.DateTimeFormat(tag, {
		year: "numeric",
		month: "numeric",
		day: "numeric",
	})
		.formatToParts(SAMPLE_DATE)
		.map(({ type }) =>
			type === "year" || type === "month" || type === "day"
				? type.charAt(0)
				: "",
		)
		.join("");
	return isDateOrder(order) ? order : undefined;
}

function keepsRegion(tag: string): boolean {
	try {
		const { region } = new Intl.Locale(tag);
		const { locale } = new Intl.DateTimeFormat(tag).resolvedOptions();
		return new Intl.Locale(locale).region === region;
	} catch {
		return false;
	}
}

function closestBase({
	language,
	system,
	dateOrder,
}: {
	language: string;
	system: Intl.Locale;
	dateOrder: DateOrder | undefined;
}): string {
	const ui = new Intl.Locale(language);
	const prefix =
		ui.script === undefined ? ui.language : `${ui.language}-${ui.script}`;
	const wanted = dateOrder ?? numericDateOrder(system.toString());
	const candidates = [
		`${prefix}-${system.region}`,
		language,
		`${prefix}-001`,
		`${prefix}-150`,
	]
		.filter((candidate, index, all) => all.indexOf(candidate) === index)
		.filter(
			(candidate) => candidate === language || keepsRegion(candidate),
		);
	return (
		candidates.find(
			(candidate) => numericDateOrder(candidate) === wanted,
		) ??
		candidates[0] ??
		language
	);
}

function defaultHourCycle(
	locale: Intl.Locale,
): Intl.LocaleHourCycleKey | undefined {
	return new Intl.DateTimeFormat(locale.toString(), {
		hour: "numeric",
	}).resolvedOptions().hourCycle;
}

function padsHour(tag: string): boolean {
	const hour = new Intl.DateTimeFormat(tag, {
		hour: "numeric",
		minute: "2-digit",
	})
		.formatToParts(SAMPLE_MORNING)
		.find(({ type }) => type === "hour");
	return hour?.value.length === 2;
}

function defaultNumberingSystem(tag: string): string {
	return new Intl.NumberFormat(tag).resolvedOptions().numberingSystem;
}

function supportedNumberingSystem({
	base,
	numberingSystem,
}: {
	base: string;
	numberingSystem: string | undefined;
}): string | undefined {
	if (numberingSystem === undefined) return undefined;
	const wanted = numberingSystem.toLowerCase();
	try {
		const tag = new Intl.Locale(base, { numberingSystem: wanted });
		return defaultNumberingSystem(tag.toString()) === wanted
			? wanted
			: undefined;
	} catch {
		return undefined;
	}
}

function formattingTag({
	base,
	hourCycle,
	numberingSystem,
}: {
	base: string;
	hourCycle: Intl.LocaleHourCycleKey | undefined;
	numberingSystem: string;
}): string {
	return new Intl.Locale(base, {
		hourCycle,
		numberingSystem:
			numberingSystem === defaultNumberingSystem(base)
				? undefined
				: numberingSystem,
	}).toString();
}

function separators({
	text,
	numberingSystem,
	chosenNumberingSystem,
	source,
	regional,
}: {
	text: string;
	numberingSystem: string;
	chosenNumberingSystem: string | undefined;
	source: Intl.Locale | undefined;
	regional: RegionalSettings;
}): Pick<FormatLocales, "decimal" | "group"> {
	const tag =
		source === undefined
			? text
			: new Intl.Locale(source.baseName, { numberingSystem }).toString();
	const parts = new Intl.NumberFormat(tag).formatToParts(SAMPLE_NUMBER);
	const symbol = (type: "decimal" | "group") =>
		parts.find((part) => part.type === type)?.value;
	const systemNumberingSystem =
		chosenNumberingSystem ??
		(source === undefined
			? numberingSystem
			: defaultNumberingSystem(source.baseName));
	const platform =
		numberingSystem === "latn" && systemNumberingSystem === "latn";
	return {
		decimal:
			(platform ? regional.decimalSeparator : undefined) ??
			symbol("decimal") ??
			".",
		group:
			(platform ? regional.groupSeparator : undefined) ??
			symbol("group") ??
			",",
	};
}

export function composeFormatLocales({
	language,
	regional,
}: {
	language: string;
	regional: RegionalSettings;
}): FormatLocales {
	const system = systemLocale(regional.locale);
	const regionalSystem = system && withOwnRegion(system);
	const dateBase =
		regionalSystem?.region === undefined
			? language
			: closestBase({
					language,
					system: regionalSystem,
					dateOrder: regional.dateOrder,
				});
	const hourCycle =
		regional.hourCycle ??
		system?.hourCycle ??
		(regionalSystem && defaultHourCycle(regionalSystem));
	const chosenNumberingSystem = supportedNumberingSystem({
		base: language,
		numberingSystem: regional.numberingSystem ?? system?.numberingSystem,
	});
	const numberingSystem =
		chosenNumberingSystem ?? defaultNumberingSystem(language);
	const text = formattingTag({ base: language, hourCycle, numberingSystem });
	const clock =
		regionalSystem === undefined
			? text
			: new Intl.Locale(regionalSystem.baseName, {
					hourCycle,
				}).toString();
	const numberSystem = systemLocale(regional.numberLocale);
	return {
		text,
		dates: formattingTag({ base: dateBase, hourCycle, numberingSystem }),
		twoDigitHour: regional.twoDigitHour ?? padsHour(clock),
		...separators({
			text,
			numberingSystem,
			chosenNumberingSystem,
			source: numberSystem ? withOwnRegion(numberSystem) : regionalSystem,
			regional,
		}),
	};
}

export function webRegionalSettings(): RegionalSettings {
	return { locale: navigator.language };
}

export function parseRegionalTag(tag: string): RegionalSettings | undefined {
	const locale = systemLocale(tag);
	if (locale === undefined) return undefined;
	const keywords = unicodeKeywords(locale);
	const weekday = isoWeekdays.indexOf(keywords.get("fw") ?? "");
	return regionalSettingsSchema.parse({
		locale: locale.toString(),
		hourCycle: locale.hourCycle,
		numberingSystem: locale.numberingSystem,
		firstDayOfWeek: weekday === -1 ? undefined : weekday + 1,
		measurementSystem: measurementKeywords[keywords.get("ms") ?? ""],
	});
}

export function parseRegionalOverride(
	value: string,
): RegionalSettings | undefined {
	if (!value.trimStart().startsWith("{")) return parseRegionalTag(value);
	try {
		const parsed = regionalSettingsSchema.safeParse(JSON.parse(value));
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}
