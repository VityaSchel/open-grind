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
const RESERVED = new Set(["children", "key"]);
const RESERVED_TAGS = new Set([...RESERVED, "count"]);

function placeholderProblem({
	token,
	name,
}: {
	token: string;
	name: string;
}): string | undefined {
	if (!NAME.test(name)) {
		return `${token} is not a plain camelCase {{name}} placeholder`;
	}
	return RESERVED.has(name) ? `${token} uses a reserved name` : undefined;
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
		return `${token} is not a plain camelCase <name> or </name> tag`;
	}
	if (RESERVED_TAGS.has(name)) return `${token} uses a reserved name`;
	const opens = slash === "" && open === undefined;
	const closes = slash === "/" && open === name;
	return opens || closes ? undefined : `${token} is unbalanced or nested`;
}

function readMarkup({ text, into }: { text: string; into: Inspection }): void {
	let open: string | undefined;
	let broken = false;
	for (const [token, placeholder] of text.matchAll(TOKEN)) {
		if (placeholder !== undefined) {
			const name = placeholder.trim();
			const problem = placeholderProblem({ token, name });
			if (problem !== undefined) {
				into.problems.push(problem);
			} else {
				into.params.push(name);
				if (open !== undefined) into.wrapped.push(name);
			}
		} else if (!broken) {
			const problem = tagProblem({ token, open });
			if (problem !== undefined) {
				into.problems.push(problem);
				broken = true;
				open = undefined;
			} else if (open === undefined) {
				open = TAG_TOKEN.exec(token)?.[2];
			} else {
				into.tags.push(open);
				open = undefined;
			}
		}
	}
	if (open !== undefined) into.problems.push(`<${open}> is never closed`);
}

export function inspect(text: string): Inspection {
	const found: Inspection = {
		params: [],
		tags: [],
		wrapped: [],
		problems: [],
	};
	if (text.includes("$t(")) {
		found.problems.push("$t() nesting is not supported");
	}
	readMarkup({ text, into: found });
	if (/[{}]/.test(text.replace(PLACEHOLDER, ""))) {
		found.problems.push("stray brace outside a {{name}} placeholder");
	}
	for (const [entity] of text.matchAll(ENTITY)) {
		found.problems.push(
			`${entity} is an HTML entity; write the character itself`,
		);
	}
	return found;
}
