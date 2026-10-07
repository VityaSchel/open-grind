export const SOURCE_LOCALE = "en";

const NAME_PATTERN = "[a-z][A-Za-z0-9]*";

export const NAME = new RegExp(`^${NAME_PATTERN}$`);

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

export const TAG_PAIR = new RegExp(`<(${NAME_PATTERN})>(.*?)</\\1>`, "gs");

export const TAG_TOKEN = new RegExp(`^<(/?)(${NAME_PATTERN})>$`);

export const MARKUP = new RegExp(
	`${PLACEHOLDER_PATTERN}|</?${NAME_PATTERN}>`,
	"g",
);

export function parseLocalePath(path: string): {
	locale: string;
	namespace: string;
} {
	const [locale = "", file = ""] = path.split(/[\\/]/).slice(-2);
	return { locale, namespace: file.replace(/\.json$/, "") };
}
