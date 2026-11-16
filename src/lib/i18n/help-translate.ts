import { LANGUAGE_NAMES } from "./language-names";
import { catalogFor, type Offered } from "./matcher";
import { PSEUDO_LOCALES } from "./pseudo";
import { SOURCE_LOCALE } from "./syntax";

const ENGAGE_PAGE = "https://i18n.opengrind.org/engage/open-grind/";

const projectLanguages: Offered = {
	catalogs: LANGUAGE_NAMES.map(({ catalog }) => catalog).filter(
		(catalog) => !PSEUDO_LOCALES.includes(catalog),
	),
	pseudo: PSEUDO_LOCALES,
};

export function helpTranslateUrl({
	system,
}: {
	system: readonly string[];
}): string {
	const [first] = system;
	const catalog =
		first === undefined
			? undefined
			: catalogFor({ tag: first, offered: projectLanguages });
	return catalog === undefined || catalog === SOURCE_LOCALE
		? ENGAGE_PAGE
		: `${ENGAGE_PAGE}-/${catalog}/`;
}
