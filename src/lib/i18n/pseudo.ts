import { MARKUP, PLURAL_KEY } from "./syntax";

const ASCII_LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ACCENTED_LETTERS = "áƀçðéƒĝĥîĵķļɱñöþǫŕšţûṽŵẋýžÅƁÇĐÉƑĜĤÎĴĶĻṀÑÖÞǪŔŠŢÛṼŴẊÝŽ";
const FILLER = " one two three four five six seven eight nine ten";
const EXPANSION = 0.35;

function accent(message: string): string {
	const markupOrLetter = new RegExp(`${MARKUP.source}|[A-Za-z]`, "g");
	return message.replace(markupOrLetter, (token) => {
		const index = ASCII_LETTERS.indexOf(token);
		return index === -1 ? token : ACCENTED_LETTERS.charAt(index);
	});
}

function bracket(text: string): string {
	return `⟦${text}⟧`;
}

function expand(message: string): string {
	const length = Math.ceil(message.replace(MARKUP, "").length * EXPANSION);
	const repeats = Math.ceil(length / FILLER.length);
	const padding = FILLER.repeat(repeats).slice(0, length);
	return bracket(accent(message + padding));
}

function overrideRightToLeft(message: string): string {
	return `\u202E${message}\u202C`;
}

const transforms = {
	"en-XA": { message: expand, formatted: bracket },
	"ar-XB": { message: overrideRightToLeft, formatted: (text) => text },
} satisfies Record<
	string,
	Record<"message" | "formatted", (text: string) => string>
>;

export type PseudoLocale = keyof typeof transforms;

export const PSEUDO_LOCALES = Object.keys(transforms);

export function isPseudoLocale(locale: string): locale is PseudoLocale {
	return Object.hasOwn(transforms, locale);
}

export function pseudoDictionary({
	locale,
	source,
}: {
	locale: PseudoLocale;
	source: ReadonlyMap<string, string>;
}): Map<string, string> {
	const transform = transforms[locale].message;
	const { pluralCategories } = new Intl.PluralRules(locale).resolvedOptions();
	const manyForms = pluralCategories.filter((category) => category !== "one");
	const dictionary = new Map<string, string>();
	for (const [key, message] of source) {
		const [, base, category] = PLURAL_KEY.exec(key) ?? [];
		const keys =
			category === "other"
				? manyForms.map((form) => `${base}_${form}`)
				: [key];
		for (const target of keys) dictionary.set(target, transform(message));
	}
	return dictionary;
}

export function markFormatted({
	locale,
	text,
}: {
	locale: string;
	text: string;
}): string {
	return isPseudoLocale(locale) ? transforms[locale].formatted(text) : text;
}
