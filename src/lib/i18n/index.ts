import type { Messages } from "./generated";
import {
	type Catalog,
	formatCount,
	getCatalogs,
	getFormatLocales,
	getSourceCatalog,
} from "./locale-state.svelte";
import type { FormatLocales } from "./regional";
import { PLACEHOLDER, RICH_TOKEN, SOURCE_LOCALE } from "./syntax";
import type {
	KeyArgs,
	MessageKey,
	Params,
	RichArgs,
	RichKey,
	RichPart,
} from "./types";

export { type CountFormatter, defaultCountFormatter } from "./counts";
export {
	followLocale,
	getCatalogLocale,
	getFormatLocales,
	getLocale,
	getRegionalSettings,
	locales,
	offersLanguage,
	resolveLanguage,
	setCountFormatter,
	setLocale,
	setRegionalSettings,
} from "./locale-state.svelte";
export type { FormatLocales, RegionalSettings } from "./regional";
export { SOURCE_LOCALE } from "./syntax";
export type * from "./types";

const SOURCE_FORMAT_LOCALES: FormatLocales = {
	text: SOURCE_LOCALE,
	dates: SOURCE_LOCALE,
	twoDigitHour: false,
	decimal: ".",
	group: ",",
};

const pluralRules = new Map<string, Intl.PluralRules>();

function pluralCategory({
	locale,
	count,
}: {
	locale: string;
	count: number;
}): Intl.LDMLPluralRule {
	let rules = pluralRules.get(locale);
	if (rules === undefined) {
		rules = new Intl.PluralRules(locale);
		pluralRules.set(locale, rules);
	}
	return rules.select(count);
}

function candidateKeys({
	key,
	locale,
	count,
}: {
	key: string;
	locale: string;
	count: number | undefined;
}): string[] {
	if (count === undefined) return [key];
	const plural = `${key}_${pluralCategory({ locale, count })}`;
	return count === 0 ? [`${key}_zero`, plural] : [plural];
}

function lookup({
	key,
	params,
	catalogs,
}: {
	key: string;
	params: Params | undefined;
	catalogs: readonly Catalog[];
}): string {
	const count = typeof params?.count === "number" ? params.count : undefined;
	for (const { locale, dictionary } of catalogs) {
		for (const candidate of candidateKeys({ key, locale, count })) {
			const text = dictionary.get(candidate);
			if (text !== undefined) return text;
		}
	}
	return count === undefined
		? key
		: lookup({ key, params: undefined, catalogs });
}

function formatValue({
	name,
	params,
	locales,
}: {
	name: string;
	params: Params | undefined;
	locales: FormatLocales;
}): string | undefined {
	if (params === undefined || !Object.hasOwn(params, name)) return undefined;
	const value = params[name];
	return name === "count" && typeof value === "number"
		? formatCount({ count: value, locales })
		: String(value);
}

function interpolate({
	template,
	params,
	locales,
}: {
	template: string;
	params: Params | undefined;
	locales: FormatLocales;
}): string {
	return template.replace(
		PLACEHOLDER,
		(placeholder, inner: string) =>
			formatValue({ name: inner.trim(), params, locales }) ?? placeholder,
	);
}

export function t<K extends MessageKey>(
	key: K,
	...args: KeyArgs<Messages[K]>
): string {
	const [params] = args;
	const template = lookup({ key, params, catalogs: getCatalogs() });
	return interpolate({ template, params, locales: getFormatLocales() });
}

export function sourceText<K extends MessageKey>(
	key: K,
	...args: KeyArgs<Messages[K]>
): string {
	const [params] = args;
	const template = lookup({ key, params, catalogs: [getSourceCatalog()] });
	return interpolate({ template, params, locales: SOURCE_FORMAT_LOCALES });
}

export type Translate = typeof t;

export function richParts<K extends RichKey>(
	key: K,
	...args: RichArgs<K>
): RichPart[] {
	const [params] = args;
	const locales = getFormatLocales();
	const template = lookup({ key, params, catalogs: getCatalogs() });
	const parts: RichPart[] = [];
	const appendText = (text: string) => {
		const last = parts.at(-1);
		if (last?.kind === "text") {
			parts[parts.length - 1] = { kind: "text", text: last.text + text };
		} else if (text !== "") {
			parts.push({ kind: "text", text });
		}
	};
	let end = 0;
	for (const match of template.matchAll(RICH_TOKEN)) {
		const [token, placeholder, tag, inner = ""] = match;
		appendText(template.slice(end, match.index));
		end = match.index + token.length;
		if (tag !== undefined) {
			const text = interpolate({ template: inner, params, locales });
			parts.push({ kind: "tag", name: tag, text });
			continue;
		}
		const name = (placeholder ?? "").trim();
		const value = formatValue({ name, params, locales });
		if (value === undefined) {
			parts.push({ kind: "placeholder", name, text: token });
		} else {
			appendText(value);
		}
	}
	appendText(template.slice(end));
	return parts;
}
