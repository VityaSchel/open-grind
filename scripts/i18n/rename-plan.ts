import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { PLURAL_CATEGORIES } from "../../src/lib/i18n/syntax";
import { readLocaleFiles } from "./locale-files";
import { moveMessage, renameLiterals } from "./move-message";
import { isRecord } from "./source-messages";

export type FileText = { file: string; text: string };

export type RenamePlan = {
	catalogs: FileText[];
	references: FileText[];
	undecided: string[];
};

type Rename = { from: string; to: string };

const LOCALE_DIRECTORY = "src/lib/i18n/locales";
const ANDROID_STRINGS = "src/lib/i18n/android-strings.json";
const UNCAPTURABLE = "scripts/i18n-screenshots/uncapturable.json";
const LITERAL_SOURCES = [
	{ pattern: "src/**/*.{js,ts,svelte}", exclude: [] },
	{ pattern: "e2e/**/*.ts", exclude: [] },
	{
		pattern: "scripts/i18n-screenshots/**/*.ts",
		exclude: ["scripts/i18n-screenshots/**/*.test.ts"],
	},
];
const PLURAL_SUFFIX = `(?:_(?:${PLURAL_CATEGORIES.join("|")}))?`;

const covers = ({ pattern, key }: { pattern: string; key: string }) =>
	pattern.endsWith(".*")
		? key.startsWith(pattern.slice(0, -1))
		: key === pattern;

function renameMentions({ text, from, to }: Rename & { text: string }): string {
	const mention = new RegExp(
		String.raw`(?<![\w.])${RegExp.escape(from)}(?=${PLURAL_SUFFIX}(?![\w*]|\.[\w*]))`,
		"g",
	);
	return text.replace(mention, to);
}

function renameUncapturable({ text, from, to }: Rename & { text: string }): {
	text: string;
	undecided: string[];
} {
	const entries: unknown = JSON.parse(text);
	if (!isRecord(entries)) {
		throw new Error(`${UNCAPTURABLE} does not hold a JSON object`);
	}
	const patterns = Object.keys(entries);
	if (patterns.includes(to)) {
		throw new Error(
			`${UNCAPTURABLE} already has an entry for ${to}; remove it, then rename again`,
		);
	}
	const undecided = patterns.includes(from)
		? []
		: patterns
				.filter(
					(pattern) =>
						covers({ pattern, key: from }) &&
						!covers({ pattern, key: to }),
				)
				.map(
					(pattern) =>
						`${UNCAPTURABLE}: ${pattern} covered ${from} but does not cover ${to}; give ${to} its own entry or show it in a screenshot view`,
				);
	return { text: renameMentions({ text, from, to }), undecided };
}

function localeFiles(root: string) {
	return [...readLocaleFiles(path.join(root, LOCALE_DIRECTORY))].flatMap(
		([locale, files]) =>
			files.map(({ namespace, text }) => ({ locale, namespace, text })),
	);
}

function literalFiles(root: string): string[] {
	return LITERAL_SOURCES.flatMap(({ pattern, exclude }) =>
		globSync(pattern, { cwd: root, exclude }),
	).sort();
}

export function planRename({
	root,
	from,
	to,
}: Rename & { root: string }): RenamePlan {
	const read = (file: string) => readFileSync(path.join(root, file), "utf8");
	const catalogs = moveMessage({ files: localeFiles(root), from, to }).map(
		({ locale, namespace, text }) => ({
			file: path.join(LOCALE_DIRECTORY, locale, `${namespace}.json`),
			text,
		}),
	);
	const uncapturableText = read(UNCAPTURABLE);
	const uncapturable = renameUncapturable({
		text: uncapturableText,
		from,
		to,
	});
	const literals = [ANDROID_STRINGS, ...literalFiles(root)].map((file) => {
		const text = read(file);
		return { file, text, renamed: renameLiterals({ text, from, to }) };
	});
	const references = [
		{
			file: UNCAPTURABLE,
			text: uncapturableText,
			renamed: uncapturable.text,
		},
		...literals,
	]
		.filter(({ text, renamed }) => renamed !== text)
		.map(({ file, renamed }) => ({ file, text: renamed }));
	return { catalogs, references, undecided: uncapturable.undecided };
}
