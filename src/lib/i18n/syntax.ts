export const SOURCE_LOCALE = "en";

export const PLACEHOLDER = /\{\{(.+?)\}\}/g;

export const PLURAL_KEY = /^(.+)_(zero|one|two|few|many|other)$/;

const TAG_NAME = "[A-Za-z][A-Za-z0-9]*";

export const TAG_PAIR = new RegExp(`<(${TAG_NAME})>(.*?)</\\1>`, "gs");

export const TAG_TOKEN = new RegExp(`^<(/?)(${TAG_NAME})>$`);

export function parseLocalePath(path: string): {
	locale: string;
	namespace: string;
} {
	const [locale = "", file = ""] = path.split(/[\\/]/).slice(-2);
	return { locale, namespace: file.replace(/\.json$/, "") };
}
