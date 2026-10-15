import {
	type LanguageName,
	languageName,
	languageNamesOf,
} from "./language-names";
import { getCatalogLocale, locales } from "./locale-state.svelte";
import { everyLanguageListed } from "./offered";
import { shippedFiles } from "./shipped-files";
import { parseLocalePath, SOURCE_LOCALE } from "./syntax";

const releaseLocales = [
	SOURCE_LOCALE,
	...Object.keys(shippedFiles).map((path) => parseLocalePath(path).locale),
];

export const listedLanguages: readonly LanguageName[] = languageNamesOf(
	everyLanguageListed ? locales : releaseLocales,
);

export function getListedLanguage(): LanguageName {
	const catalog = getCatalogLocale();
	return (
		listedLanguages.find((name) => name.catalog === catalog) ??
		languageName(SOURCE_LOCALE)
	);
}
