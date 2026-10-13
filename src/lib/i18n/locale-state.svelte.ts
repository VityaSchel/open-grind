import { untrack } from "svelte";

import {
	type CatalogJson,
	sourceFiles,
	translationFiles,
} from "./catalog-files";
import { type CountFormatter, defaultCountFormatter } from "./counts";
import { textDirection } from "./direction";
import {
	catalogFor,
	messageChain,
	normalizeTag,
	type Offered,
} from "./matcher";
import { everyLanguageOffered } from "./offered";
import { isPseudoLocale, PSEUDO_LOCALES, pseudoDictionary } from "./pseudo";
import {
	composeFormatLocales,
	type FormatLocales,
	type RegionalSettings,
	regionalSettingsSchema,
	webRegionalSettings,
} from "./regional";
import { DEFAULT_LOCALE, parseLocalePath, SOURCE_LOCALE } from "./syntax";

export type Catalog = {
	readonly locale: string;
	readonly dictionary: ReadonlyMap<string, string>;
};

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
	if (everyLanguageOffered && isPseudoLocale(locale)) {
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
	locale: string = $state(DEFAULT_LOCALE);
	requested: string = DEFAULT_LOCALE;
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
	...(everyLanguageOffered ? PSEUDO_LOCALES : []),
]
	.filter((locale, index, all) => all.indexOf(locale) === index)
	.sort();

const offered: Offered = { catalogs: locales, pseudo: PSEUDO_LOCALES };

export function getLocale(): string {
	return state.locale;
}

export function getCatalogLocale(): string {
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
	const tag = normalizeTag(locale);
	const catalog =
		tag === undefined ? undefined : catalogFor({ tag, offered });
	if (tag === undefined || catalog === undefined) {
		throw new RangeError(`No translations for locale "${locale}"`);
	}
	state.requested = tag;
	const chain = messageChain({ catalog, offered }).filter(
		(id) => id !== SOURCE_LOCALE,
	);
	const translations =
		chain.length === 0
			? []
			: await Promise.all(chain.map((id) => loadCatalog(id)));
	if (state.requested !== tag) return;
	state.translations = translations;
	state.locale = tag;
	document.documentElement.lang = tag;
	document.documentElement.dir = textDirection(tag);
}
