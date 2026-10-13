import { textDirection } from "../../src/lib/i18n/direction";
import { SOURCE_LOCALE } from "../../src/lib/i18n/syntax";

export type Completion = {
	readonly translated: number;
	readonly total: number;
};

export type ShippedCheck = {
	languages: string[];
	errors: string[];
	warnings: string[];
};

const FILE = "shipped.json";

function isRightToLeft(directory: string): boolean {
	try {
		return textDirection(directory) === "rtl";
	} catch {
		return false;
	}
}

function parseEntries(text: string): unknown[] | string {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		const reason = error instanceof Error ? error.message : error;
		return `is not valid JSON: ${reason}`;
	}
	return Array.isArray(json)
		? json
		: 'must hold an array of language directories, such as ["de", "pt-BR"]';
}

type Entry =
	| { readonly error: string }
	| { readonly directory: string; readonly completion: Completion };

function readEntry({
	entry,
	seen,
	completion,
}: {
	entry: unknown;
	seen: ReadonlySet<string>;
	completion: ReadonlyMap<string, Completion>;
}): Entry {
	if (typeof entry !== "string") {
		return {
			error: `${JSON.stringify(entry)} is not a language directory such as "de"`,
		};
	}
	if (entry === SOURCE_LOCALE) {
		return { error: `${entry}: English always ships, so remove it` };
	}
	if (seen.has(entry)) return { error: `${entry}: is listed twice` };
	const counts = completion.get(entry);
	if (counts === undefined) {
		return { error: `${entry}: has no locales/${entry} directory` };
	}
	if (isRightToLeft(entry)) {
		return {
			error: `${entry}: is written right to left, which the app cannot lay out yet, so remove it`,
		};
	}
	return { directory: entry, completion: counts };
}

export function checkShipped({
	text,
	completion,
	release,
}: {
	text: string;
	completion: ReadonlyMap<string, Completion>;
	release: boolean;
}): ShippedCheck {
	const result: ShippedCheck = { languages: [], errors: [], warnings: [] };
	const entries = parseEntries(text);
	if (typeof entries === "string") {
		result.errors.push(`${FILE}: ${entries}`);
		return result;
	}
	const seen = new Set<string>();
	for (const entry of entries) {
		const read = readEntry({ entry, seen, completion });
		if (typeof entry === "string") seen.add(entry);
		if ("error" in read) {
			result.errors.push(`${FILE}: ${read.error}`);
			continue;
		}
		const { directory } = read;
		const { translated, total } = read.completion;
		result.languages.push(directory);
		if (translated < total) {
			(release ? result.errors : result.warnings).push(
				`${FILE}: ${directory}: has ${translated} of ${total} messages translated, and a release ships only complete languages`,
			);
		}
	}
	result.languages.sort();
	return result;
}

export function renderShippedFiles(languages: readonly string[]): string {
	if (languages.length === 0) return "export const shippedFiles = {};\n";
	const globs = [...languages]
		.sort()
		.map((directory) => `\t\t"./locales/${directory}/*.json",\n`)
		.join("");
	return [
		'import type { CatalogJson } from "./catalog-files";\n',
		"\n",
		"export const shippedFiles = import.meta.glob<CatalogJson>(\n",
		`\t[\n${globs}\t],\n`,
		'\t{ import: "default" },\n',
		");\n",
	].join("");
}
