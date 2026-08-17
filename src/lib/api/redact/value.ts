import { proseKeys, verbatimKeys } from "$lib/api/redact/policy";
import { capText, documentTitle, scrubText } from "$lib/api/redact/text";

const maxDepth = 6;
const maxArrayItems = 10;
const maxKeptChars = 300;
const maxTitleChars = 100;
const maxParseChars = 512 * 1024;

export function parseJson(
	text: string,
): { ok: true; value: unknown } | { ok: false } {
	if (text.length > maxParseChars) return { ok: false };
	try {
		return {
			ok: true,
			value: JSON.parse(text, (key: string, value: unknown) =>
				key === "__proto__" ? undefined : value,
			),
		};
	} catch {
		return { ok: false };
	}
}

export type NonJsonSummary =
	| { nonJson: "html"; length: number; title?: string }
	| { nonJson: "text"; length: number };

export function redactResponseBody(text: string): unknown {
	const parsed = parseJson(text);
	return parsed.ok ? redactValue(parsed.value) : summariseNonJson(text);
}

export function readResponseBody(text: string): unknown {
	const parsed = parseJson(text);
	return parsed.ok ? parsed.value : text;
}

export function summariseNonJson(text: string): NonJsonSummary {
	const head = text.slice(0, maxParseChars);
	if (!looksLikeMarkup(head)) {
		return { nonJson: "text", length: text.length };
	}
	const title = documentTitle(head);
	return {
		nonJson: "html",
		length: text.length,
		...(title !== undefined && {
			title: scrubText(capText(title, maxTitleChars)),
		}),
	};
}

function looksLikeMarkup(text: string): boolean {
	const trimmed = text.trimStart();
	if (trimmed.startsWith("<")) return true;
	const lowered = trimmed.toLowerCase();
	return lowered.includes("<html") || lowered.includes("<!doctype");
}

export function redactValue(value: unknown): unknown {
	return walk({ value, depth: 0, seen: new WeakSet() });
}

function walk({
	value,
	depth,
	seen,
}: {
	value: unknown;
	depth: number;
	seen: WeakSet<object>;
}): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value !== "object") return maskLeaf(value);
	if (seen.has(value)) return "<circular>";
	if (depth >= maxDepth) return "<nested>";

	seen.add(value);
	try {
		if (Array.isArray(value)) return walkArray({ value, depth, seen });
		if (!isPlainObject(value))
			return `<${value.constructor?.name ?? "object"}>`;
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				walkEntry({ key, value: item, depth, seen }),
			]),
		);
	} finally {
		seen.delete(value);
	}
}

function walkArray({
	value,
	depth,
	seen,
}: {
	value: unknown[];
	depth: number;
	seen: WeakSet<object>;
}): unknown[] {
	const items: unknown[] = value
		.slice(0, maxArrayItems)
		.map((item) => walk({ value: item, depth: depth + 1, seen }));
	if (value.length > maxArrayItems) {
		items.push(`<+${value.length - maxArrayItems} more>`);
	}
	return items;
}

function walkEntry({
	key,
	value,
	depth,
	seen,
}: {
	key: string;
	value: unknown;
	depth: number;
	seen: WeakSet<object>;
}): unknown {
	if (typeof value === "string") {
		if (verbatimKeys.has(key)) return capText(value, maxKeptChars);
		if (proseKeys.has(key)) return scrubText(capText(value, maxKeptChars));
	} else if (verbatimKeys.has(key) && typeof value !== "object") {
		return value;
	}
	return walk({ value, depth: depth + 1, seen });
}

function maskLeaf(value: unknown): string {
	if (typeof value === "string") return `<string:${value.length}>`;
	return `<${typeof value}>`;
}

function isPlainObject(value: object): boolean {
	const prototype = Object.getPrototypeOf(value) as unknown;
	return prototype === Object.prototype || prototype === null;
}
