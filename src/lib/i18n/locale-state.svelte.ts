import { untrack } from "svelte";

import {
	type CatalogJson,
	sourceFiles,
	translationFiles,
} from "./catalog-files";
import { type CountFormatter, defaultCountFormatter } from "./counts";
import { isPseudoLocale, PSEUDO_LOCALES, pseudoDictionary } from "./pseudo";
import {
	composeFormatLocales,
	type FormatLocales,
	type RegionalSettings,
	regionalSettingsSchema,
	webRegionalSettings,
} from "./regional";
import { FALLBACK_LOCALES, parseLocalePath, SOURCE_LOCALE } from "./syntax";

export type Catalog = {
	readonly locale: string;
	readonly dictionary: ReadonlyMap<string, string>;
};

const RTL_SCRIPTS = new Set([
	"Adlm",
	"Aran",
	"Arab",
	"Armi",
	"Avst",
	"Chrs",
	"Cprt",
	"Elym",
	"Hatr",
	"Hebr",
	"Hung",
	"Khar",
	"Lydi",
	"Mand",
	"Mani",
	"Mend",
	"Merc",
	"Mero",
	"Narb",
	"Nbat",
	"Nkoo",
	"Orkh",
	"Ougr",
	"Palm",
	"Phli",
	"Phlp",
	"Phnx",
	"Prti",
	"Rohg",
	"Samr",
	"Sarb",
	"Sogd",
	"Sogo",
	"Syrc",
	"Thaa",
	"Yezi",
]);

function flatten({
	json,
	key,
	into,
}: {
	json: CatalogJson;
	key: string;
	into: Map<string, string>;
}): void {
	if (typeof json === "string") {
		if (json !== "") into.set(key, json);
		return;
	}
	for (const [segment, child] of Object.entries(json)) {
		flatten({ json: child, key: `${key}.${segment}`, into });
	}
}

function toCatalog({
	locale,
	files,
}: {
	locale: string;
	files: [path: string, json: CatalogJson][];
}): Catalog {
	const dictionary = new Map<string, string>();
	for (const [path, json] of files) {
		const { namespace } = parseLocalePath(path);
		flatten({ json, key: namespace, into: dictionary });
	}
	return { locale, dictionary };
}

async function loadCatalog(locale: string): Promise<Catalog> {
	if (import.meta.env.DEV && isPseudoLocale(locale)) {
		const source = state.source.dictionary;
		return { locale, dictionary: pseudoDictionary({ locale, source }) };
	}
	const files = Object.entries(translationFiles).filter(
		([path]) => parseLocalePath(path).locale === locale,
	);
	const loaded = await Promise.all(
		files.map(
			async ([path, load]): Promise<[string, CatalogJson]> => [
				path,
				await load(),
			],
		),
	);
	return toCatalog({ locale, files: loaded });
}

function loadTranslations(locale: string): Promise<Catalog[]> {
	const chain = [locale, ...(FALLBACK_LOCALES.get(locale) ?? [])];
	return Promise.all(chain.map((chainLocale) => loadCatalog(chainLocale)));
}

function textDirection(locale: string): "ltr" | "rtl" {
	const { script = "" } = new Intl.Locale(locale).maximize();
	return RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
}

function settingsKey(regional: RegionalSettings): string {
	return JSON.stringify(regionalSettingsSchema.parse(regional));
}

const sourceCatalog = toCatalog({
	locale: SOURCE_LOCALE,
	files: Object.entries(sourceFiles),
});

class LocaleState {
	source: Catalog = $state.raw(sourceCatalog);
	translations: readonly Catalog[] = $state.raw([]);
	countFormatter: CountFormatter = defaultCountFormatter;
	requested = SOURCE_LOCALE;
	regional: RegionalSettings = $state.raw(webRegionalSettings());
	regionalKey = settingsKey(this.regional);
}

const hotData: { state?: LocaleState } | undefined = import.meta.hot?.data;
const state = hotData?.state ?? new LocaleState();

if (hotData) {
	state.source = sourceCatalog;
	hotData.state = state;
	import.meta.hot?.accept();
}

export const locales: readonly string[] = [
	SOURCE_LOCALE,
	...Object.keys(translationFiles).map(
		(path) => parseLocalePath(path).locale,
	),
	...(import.meta.env.DEV ? PSEUDO_LOCALES : []),
]
	.filter((locale, index, all) => all.indexOf(locale) === index)
	.sort();

export function getLocale(): string {
	return state.translations[0]?.locale ?? SOURCE_LOCALE;
}

let composed: { key: string; locales: FormatLocales } | undefined;

export function getRegionalSettings(): RegionalSettings {
	return state.regional;
}

export function setRegionalSettings(regional: RegionalSettings): void {
	const key = settingsKey(regional);
	if (key === state.regionalKey) return;
	state.regionalKey = key;
	state.regional = regionalSettingsSchema.parse(regional);
}

export function getFormatLocales(): FormatLocales {
	const language = getLocale();
	const regional = state.regional;
	const key = `${language}|${state.regionalKey}`;
	if (composed?.key !== key) {
		composed = {
			key,
			locales: composeFormatLocales({ language, regional }),
		};
	}
	return composed.locales;
}

export function followLocale(apply: () => void): () => void {
	return $effect.root(() => {
		$effect(() => {
			getFormatLocales();
			untrack(apply);
		});
	});
}

export function getTextDirection(): "ltr" | "rtl" {
	return textDirection(getLocale());
}

export function getCatalogs(): readonly Catalog[] {
	return [...state.translations, state.source];
}

export function getSourceCatalog(): Catalog {
	return state.source;
}

export function formatCount({
	count,
	locales,
}: {
	count: number;
	locales: FormatLocales;
}): string {
	const { text: locale, decimal } = locales;
	return state.countFormatter({ count, locale, decimal });
}

export function setCountFormatter(formatter: CountFormatter): void {
	state.countFormatter = formatter;
}

export async function setLocale({ locale }: { locale: string }): Promise<void> {
	if (!locales.includes(locale)) {
		throw new RangeError(`No translations for locale "${locale}"`);
	}
	state.requested = locale;
	const translations =
		locale === SOURCE_LOCALE ? [] : await loadTranslations(locale);
	if (state.requested !== locale) return;
	state.translations = translations;
	document.documentElement.lang = locale;
	document.documentElement.dir = textDirection(locale);
}
