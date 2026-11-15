import { NAME, PLACEHOLDER, TAG_TOKEN } from "../../src/lib/i18n/syntax";

export type Inspection = {
	params: string[];
	tags: string[];
	wrapped: string[];
	problems: string[];
};

const TOKEN = new RegExp(
	`${PLACEHOLDER.source}|<\\/?[\\p{L}\\p{N}_][^<>]*>`,
	"gu",
);
const ENTITY = /&(?:[A-Za-z][A-Za-z0-9]*|#\d+|#[Xx][\dA-Fa-f]+);/g;
const LETTER = /\p{L}/u;
const RICH_PROP_NAMES = new Set(["children", "key"]);

function placeholderProblem({
	token,
	name,
}: {
	token: string;
	name: string;
}): string | undefined {
	if (!NAME.test(name)) {
		return `${token} is not a valid placeholder; write {{camelCaseName}} with no format options`;
	}
	return RICH_PROP_NAMES.has(name)
		? `${token} is reserved for a Rich.svelte prop; pick another name`
		: undefined;
}

function tagProblem({
	token,
	open,
}: {
	token: string;
	open: string | undefined;
}): string | undefined {
	const [, slash, name = ""] = TAG_TOKEN.exec(token) ?? [];
	if (slash === undefined) {
		return `${token} is not a valid tag; write <camelCaseName> or </camelCaseName> with no attributes`;
	}
	if (RICH_PROP_NAMES.has(name)) {
		return `${token} is reserved for a Rich.svelte prop; pick another name`;
	}
	if (name === "count") {
		return `${token} is reserved for the plural {{count}}; pick another name`;
	}
	if (slash === "") {
		return open === undefined
			? undefined
			: `${token} opens inside <${open}>, but tags cannot nest`;
	}
	if (open === undefined) {
		return `${token} has no matching <${name}> before it`;
	}
	return open === name
		? undefined
		: `${token} does not match the open <${open}>`;
}

function readMarkup({ text, into }: { text: string; into: Inspection }): void {
	let open: { name: string; wrapsText: boolean } | undefined;
	let broken = false;
	let end = 0;
	for (const match of text.matchAll(TOKEN)) {
		const [token, placeholder] = match;
		if (open !== undefined) {
			open.wrapsText ||= LETTER.test(text.slice(end, match.index));
		}
		end = match.index + token.length;
		if (placeholder !== undefined) {
			const name = placeholder.trim();
			const problem = placeholderProblem({ token, name });
			if (problem !== undefined) {
				into.problems.push(problem);
			} else {
				into.params.push(name);
				if (open !== undefined) {
					into.wrapped.push(name);
					open.wrapsText ||= name === "count";
				}
			}
		} else if (!broken) {
			const problem = tagProblem({ token, open: open?.name });
			if (problem !== undefined) {
				into.problems.push(problem);
				broken = true;
				open = undefined;
			} else if (open === undefined) {
				const name = TAG_TOKEN.exec(token)?.[2] ?? "";
				open = { name, wrapsText: false };
			} else {
				into.tags.push(open.name);
				if (!open.wrapsText) {
					into.problems.push(
						`<${open.name}> wraps no text; use a {{placeholder}} for what the app supplies`,
					);
				}
				open = undefined;
			}
		}
	}
	if (open !== undefined) {
		into.problems.push(
			`<${open.name}> is never closed; add </${open.name}> after its text`,
		);
	}
}

export function inspect(text: string): Inspection {
	const found: Inspection = {
		params: [],
		tags: [],
		wrapped: [],
		problems: [],
	};
	if (text.includes("$t(")) {
		found.problems.push(
			"$t() is not supported; write the referenced text out in full",
		);
	}
	readMarkup({ text, into: found });
	if (/[{}]/.test(text.replace(PLACEHOLDER, ""))) {
		found.problems.push(
			"has a { or } that is not part of a {{name}} placeholder",
		);
	}
	for (const [entity] of text.matchAll(ENTITY)) {
		found.problems.push(
			`${entity} is an HTML entity; write the character itself`,
		);
	}
	return found;
}
