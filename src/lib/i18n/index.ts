import type { Messages, RichMessages } from "./generated";
import { formatCount, getCatalogs } from "./locale-state.svelte";
import { PLACEHOLDER, TAG_PAIR } from "./syntax";
import type { KeyArgs, MessageKey, Params, RichKey, RichPart } from "./types";

export {
	type CountFormatter,
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

function lookup(key: string, params: Params | undefined): string {
	const count = typeof params?.count === "number" ? params.count : undefined;
	for (const { locale, dictionary } of getCatalogs()) {
		for (const candidate of candidateKeys({ key, locale, count })) {
			const text = dictionary.get(candidate);
			if (text !== undefined) return text;
		}
	}
	return count === undefined ? key : lookup(key, undefined);
}

function interpolate(template: string, params: Params | undefined): string {
	return template.replace(PLACEHOLDER, (placeholder, inner: string) => {
		const name = inner.trim();
		if (params === undefined || !Object.hasOwn(params, name)) {
			return placeholder;
		}
		const value = params[name];
		return name === "count" && typeof value === "number"
			? formatCount(value)
			: String(value);
	});
}

export function t<K extends MessageKey>(
	key: K,
	...args: KeyArgs<Messages[K]>
): string {
	const [params] = args;
	return interpolate(lookup(key, params), params);
}

export function richParts<K extends RichKey>(
	key: K,
	...args: KeyArgs<RichMessages[K]>
): RichPart[] {
	const [params] = args;
	const template = lookup(key, params);
	const parts: RichPart[] = [];
	let end = 0;
	for (const match of template.matchAll(TAG_PAIR)) {
		const [element, tag, inner = ""] = match;
		if (match.index > end) {
			const text = interpolate(template.slice(end, match.index), params);
			parts.push({ text });
		}
		parts.push({ tag, text: interpolate(inner, params) });
		end = match.index + element.length;
	}
	if (end < template.length) {
		parts.push({ text: interpolate(template.slice(end), params) });
	}
	return parts;
}
