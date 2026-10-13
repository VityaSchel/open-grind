import { markMessage } from "./markers";
import { everyLanguageOffered } from "./offered";
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

interface PseudoTransform {
	message: (source: { key: string; message: string }) => string;
	formatted: (text: string) => string;
}

const unchanged = (text: string): string => text;

const transforms = new Map<string, PseudoTransform>([
	[
		"en-XA",
		{ message: ({ message }) => expand(message), formatted: bracket },
	],
	[
		"ar-XB",
		{
			message: ({ message }) => overrideRightToLeft(message),
			formatted: unchanged,
		},
	],
	...(everyLanguageOffered
		? [["en-XM", { message: markMessage, formatted: unchanged }] as const]
		: []),
]);

export const PSEUDO_LOCALES = ["ar-XB", "en-XA", "en-XM"];

export function isPseudoLocale(locale: string): boolean {
	return transforms.has(locale);
}

export function pseudoDictionary({
	locale,
	source,
}: {
	locale: string;
	source: ReadonlyMap<string, string>;
}): Map<string, string> {
	const transform = transforms.get(locale)?.message;
	if (transform === undefined) {
		throw new RangeError(`"${locale}" is not a pseudo-locale`);
	}
	const { pluralCategories } = new Intl.PluralRules(locale).resolvedOptions();
	const manyForms = pluralCategories.filter((category) => category !== "one");
	const dictionary = new Map<string, string>();
	for (const [key, message] of source) {
		const [, base = key, category] = PLURAL_KEY.exec(key) ?? [];
		const keys =
			category === "other"
				? manyForms.map((form) => `${base}_${form}`)
				: [key];
		const text = transform({ key: base, message });
		for (const target of keys) dictionary.set(target, text);
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
	return transforms.get(locale)?.formatted(text) ?? text;
}
