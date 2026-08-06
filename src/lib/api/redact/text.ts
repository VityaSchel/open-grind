import {
	geohashQueryParams,
	verbatimQueryParams,
} from "$lib/api/redact/policy";

const idPlaceholder = "{id}";

const url = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]]+/gi;
const emailAddress = /[^\s@<>()[\]",;:]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const posixHomeDirectory = /(\/(?:Users|home)\/)[^/\s:)"']+/g;
const windowsHomeDirectory = /([A-Za-z]:\\Users\\)[^\\\s:)"']+/g;

const routeLiteral = /^(v[0-9]+(\.[0-9]+)?|[a-z]+)$/;
const geohashCharacters = /^[0-9b-hjkmnp-z]+$/;
const documentTitleTag = /<title[^>]*>([^<]*)<\/title>/i;

const geohashPrefixLength = 2;

export function capText(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}…<+${text.length - max} chars>`;
}

export function maskGeohash(value: string): string {
	return (
		value.slice(0, geohashPrefixLength) +
		"*".repeat(Math.max(0, value.length - geohashPrefixLength))
	);
}

export function scrubText(text: string): string {
	return maskHomeDirectories(text.replace(url, maskUrl)).replace(
		emailAddress,
		"<email>",
	);
}

function maskUrl(match: string): string {
	let parsed;
	try {
		parsed = new URL(match);
	} catch {
		return "<url>";
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return "<url>";
	}
	return parsed.origin + redactPath(parsed.pathname + parsed.search);
}

function maskHomeDirectories(text: string): string {
	return text
		.replace(posixHomeDirectory, "$1<user>")
		.replace(windowsHomeDirectory, "$1<user>");
}

export function redactPath(path: string): string {
	const queryStart = path.indexOf("?");
	const pathname = queryStart === -1 ? path : path.slice(0, queryStart);
	const redactedPathname = pathname
		.split("/")
		.map((segment) =>
			segment === "" || routeLiteral.test(segment)
				? segment
				: idPlaceholder,
		)
		.join("/");
	if (queryStart === -1) return redactedPathname;
	return `${redactedPathname}?${redactQuery(path.slice(queryStart + 1))}`;
}

function redactQuery(query: string): string {
	return query
		.split("&")
		.map((pair) => {
			const separator = pair.indexOf("=");
			if (separator === -1) return pair;
			const name = pair.slice(0, separator);
			return `${name}=${redactQueryValue({ name, value: pair.slice(separator + 1) })}`;
		})
		.join("&");
}

function redactQueryValue({
	name,
	value,
}: {
	name: string;
	value: string;
}): string {
	if (verbatimQueryParams.has(name)) return value;
	if (geohashQueryParams.has(name) && geohashCharacters.test(value)) {
		return maskGeohash(value);
	}
	return queryValueShape(decodeQueryValue(value));
}

function queryValueShape(value: string): string {
	if (value === "true" || value === "false") return "{boolean}";
	if (value !== "" && Number.isFinite(Number(value))) return "{number}";
	if (value.includes(",")) return `{list:${value.split(",").length}}`;
	return `{string:${value.length}}`;
}

function decodeQueryValue(value: string): string {
	try {
		return decodeURIComponent(value.replace(/\+/g, " "));
	} catch {
		return value;
	}
}

export function redactStack({
	stack,
	message,
}: {
	stack: string;
	message: string;
}): string {
	const headerEnd = stack.indexOf(message);
	if (headerEnd === -1) return maskHomeDirectories(stack);
	const bodyStart = headerEnd + message.length;
	return (
		scrubText(stack.slice(0, bodyStart)) +
		maskHomeDirectories(stack.slice(bodyStart))
	);
}

export function documentTitle(html: string): string | undefined {
	return documentTitleTag.exec(html)?.[1]?.trim() || undefined;
}
