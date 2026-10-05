export const SOURCE_LOCALE = "en";

export const KEY_SEGMENT = /^[A-Za-z0-9][\w-]*$/;

const PLACEHOLDER_PATTERN = String.raw`\{\{(.+?)\}\}`;

export const PLACEHOLDER = new RegExp(PLACEHOLDER_PATTERN, "g");

export const PLURAL_CATEGORIES = [
	"zero",
	"one",
	"two",
	"few",
	"many",
	"other",
] as const satisfies readonly Intl.LDMLPluralRule[];

export const PLURAL_KEY = new RegExp(`^(.+)_(${PLURAL_CATEGORIES.join("|")})$`);

const TAG_NAME = "[A-Za-z][A-Za-z0-9]*";

export const TAG_PAIR = new RegExp(`<(${TAG_NAME})>(.*?)</\\1>`, "gs");

export const TAG_TOKEN = new RegExp(`^<(/?)(${TAG_NAME})>$`);

export const MARKUP = new RegExp(`${PLACEHOLDER_PATTERN}|</?${TAG_NAME}>`, "g");

export function parseLocalePath(path: string): {
	locale: string;
	namespace: string;
} {
	const [locale = "", file = ""] = path.split(/[\\/]/).slice(-2);
	return { locale, namespace: file.replace(/\.json$/, "") };
}
