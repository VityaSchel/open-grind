import { PLURAL_KEY, SOURCE_LOCALE } from "../../src/lib/i18n/syntax";
import { inspect } from "./message-text";

export type AllowedPlaceholders = Readonly<
	Record<string, Readonly<Record<string, string>>>
>;

const ALLOWLIST = "scripts/i18n/plural-placeholders.ts";

export const ALLOWED_PLURAL_PLACEHOLDERS: AllowedPlaceholders = {
	"feedback.sessionError.detailAfterAttempts": {
		detail: "the error text, not a number",
	},
	"settings.profile.combo.selected": {
		max: "a bare number after the slash that no word agrees with",
	},
	"settings.profile.combo.selectedAtMax": {
		max: "a bare number after the slash that no word agrees with",
	},
};

function pluralPlaceholders(
	texts: ReadonlyMap<string, string>,
): Map<string, Set<string>> {
	const found = new Map<string, Set<string>>();
	for (const [key, text] of texts) {
		const base = PLURAL_KEY.exec(key)?.[1];
		if (base === undefined) continue;
		const names = found.get(base) ?? new Set<string>();
		for (const name of inspect(text).params) {
			if (name !== "count") names.add(name);
		}
		found.set(base, names);
	}
	return found;
}

export function checkPluralPlaceholders({
	texts,
	allowed,
}: {
	texts: ReadonlyMap<string, string>;
	allowed: AllowedPlaceholders;
}): string[] {
	const found = pluralPlaceholders(texts);
	const errors: string[] = [];
	for (const [base, names] of found) {
		for (const name of names) {
			if (allowed[base]?.[name] === undefined) {
				errors.push(
					`${SOURCE_LOCALE}/${base}: its plural forms follow {{count}} alone, so no word can agree with {{${name}}}; give each number its own plural message keyed by {{count}}, or allow {{${name}}} in ${ALLOWLIST} with the reason`,
				);
			}
		}
	}
	for (const [base, names] of Object.entries(allowed)) {
		for (const name of Object.keys(names)) {
			if (found.get(base)?.has(name) !== true) {
				errors.push(
					`${ALLOWLIST}: ${base} has no plural message with {{${name}}}; remove the entry`,
				);
			}
		}
	}
	return errors;
}
