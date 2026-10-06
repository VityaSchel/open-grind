import {
	type CatalogJson,
	sourceFiles,
	translationFiles,
} from "./catalog-files";
import { isPseudoLocale, PSEUDO_LOCALES, pseudoDictionary } from "./pseudo";
import { parseLocalePath, SOURCE_LOCALE } from "./syntax";

export type Catalog = {
	readonly locale: string;
	readonly dictionary: ReadonlyMap<string, string>;
};

export type CountFormatter = (options: {
	count: number;
	locale: string;
}) => string;

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

function textDirection(locale: string): "ltr" | "rtl" {
	const { script = "" } = new Intl.Locale(locale).maximize();
	return RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
}

const sourceCatalog = toCatalog({
	locale: SOURCE_LOCALE,
	files: Object.entries(sourceFiles),
});

class LocaleState {
	source: Catalog = $state.raw(sourceCatalog);
	translation: Catalog | undefined = $state.raw();
	countFormatter: CountFormatter = ({ count }) => String(count);
	requested = SOURCE_LOCALE;
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
	return state.translation?.locale ?? SOURCE_LOCALE;
}

export function getTextDirection(): "ltr" | "rtl" {
	return textDirection(getLocale());
}

export function getCatalogs(): readonly Catalog[] {
	const { translation, source } = state;
	return translation === undefined ? [source] : [translation, source];
}

export function getSourceCatalog(): Catalog {
	return state.source;
}

export function formatCount({
	count,
	locale,
}: {
	count: number;
	locale: string;
}): string {
	return state.countFormatter({ count, locale });
}

export function setCountFormatter(formatter: CountFormatter): void {
	state.countFormatter = formatter;
}

export async function setLocale({ locale }: { locale: string }): Promise<void> {
	if (!locales.includes(locale)) {
		throw new RangeError(`No translations for locale "${locale}"`);
	}
	state.requested = locale;
	const translation =
		locale === SOURCE_LOCALE ? undefined : await loadCatalog(locale);
	if (state.requested !== locale) return;
	state.translation = translation;
	document.documentElement.lang = locale;
	document.documentElement.dir = textDirection(locale);
}
