import type { Messages, RichMessages } from "./generated";
import {
	type Catalog,
	formatCount,
	getCatalogs,
	getLocale,
	getSourceCatalog,
} from "./locale-state.svelte";
import { PLACEHOLDER, SOURCE_LOCALE, TAG_PAIR } from "./syntax";
import type { KeyArgs, MessageKey, Params, RichKey, RichPart } from "./types";

export {
	type CountFormatter,
	followLocale,
	getLocale,
	locales,
	setCountFormatter,
	setLocale,
} from "./locale-state.svelte";
export { SOURCE_LOCALE } from "./syntax";
export type * from "./types";

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

function interpolate({
	template,
	params,
	locale,
}: {
	template: string;
	params: Params | undefined;
	locale: string;
}): string {
	return template.replace(PLACEHOLDER, (placeholder, inner: string) => {
		const name = inner.trim();
		if (params === undefined || !Object.hasOwn(params, name)) {
			return placeholder;
		}
		const value = params[name];
		return name === "count" && typeof value === "number"
			? formatCount({ count: value, locale })
			: String(value);
	});
}

export function t<K extends MessageKey>(
	key: K,
	...args: KeyArgs<Messages[K]>
): string {
	const [params] = args;
	const template = lookup({ key, params, catalogs: getCatalogs() });
	return interpolate({ template, params, locale: getLocale() });
}

export function sourceText<K extends MessageKey>(
	key: K,
	...args: KeyArgs<Messages[K]>
): string {
	const [params] = args;
	const template = lookup({ key, params, catalogs: [getSourceCatalog()] });
	return interpolate({ template, params, locale: SOURCE_LOCALE });
}

export type Translate = typeof t;

export function richParts<K extends RichKey>(
	key: K,
	...args: KeyArgs<RichMessages[K]>
): RichPart[] {
	const [params] = args;
	const locale = getLocale();
	const text = (template: string) =>
		interpolate({ template, params, locale });
	const template = lookup({ key, params, catalogs: getCatalogs() });
	const parts: RichPart[] = [];
	let end = 0;
	for (const match of template.matchAll(TAG_PAIR)) {
		const [element, tag, inner = ""] = match;
		if (match.index > end) {
			parts.push({ text: text(template.slice(end, match.index)) });
		}
		parts.push({ tag, text: text(inner) });
		end = match.index + element.length;
	}
	if (end < template.length) {
		parts.push({ text: text(template.slice(end)) });
	}
	return parts;
}
