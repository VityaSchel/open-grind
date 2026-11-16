import { PLACEHOLDER } from "../../src/lib/i18n/syntax";
import {
	checkNativeManifest,
	type NativeManifestCheck,
} from "./native-manifest";
import type { Message } from "./source-messages";

export type AndroidManifest = ReadonlyMap<string, string>;

export type AndroidManifestCheck = NativeManifestCheck;

export type RenderedAndroidStrings = { text: string; errors: string[] };

export type AndroidFile = { file: string; text: string };

export type AndroidDrift = {
	errors: string[];
	warnings: string[];
	writes: AndroidFile[];
	deletes: string[];
};

export const ANDROID_MANIFEST = "src/lib/i18n/android-strings.json";

export const ANDROID_RES = "src-tauri/gen/android/app/src/main/res";

export const ENGLISH_STRINGS = `${ANDROID_RES}/values/strings.xml`;

const MANIFEST = "android-strings.json";

const DECLARED_STRING = /<string\s[^>]*?\bname="([^"]*)"/g;

const RESOURCE_NAME = /^[a-z][a-z0-9_]*$/;

const TWO_LETTER_REGION = /^[A-Z]{2}$/;

const LEGACY_LANGUAGES = new Map([
	["he", "iw"],
	["id", "in"],
	["yi", "ji"],
]);

const ESCAPED = /[\\'"&<>%\u0000-\u001F]/g;

const ESCAPES = new Map([
	["\\", "\\\\"],
	["'", "\\'"],
	['"', '\\"'],
	["\n", "\\n"],
	["\t", "\\t"],
	["&", "&amp;"],
	["<", "&lt;"],
	[">", "&gt;"],
]);

const NEEDS_QUOTES = /^ | $| {2}/;

const REFERENCE_START = /^[@?]/;

const hex = (code: number) => code.toString(16).toUpperCase().padStart(4, "0");

export function androidQualifier(directory: string): string {
	const { baseName, language } = new Intl.Locale(directory);
	const subtags = baseName.split("-").slice(1);
	const code = LEGACY_LANGUAGES.get(language) ?? language;
	const [region] = subtags;
	if (region === undefined) return code;
	if (subtags.length === 1 && TWO_LETTER_REGION.test(region)) {
		return `${code}-r${region}`;
	}
	return ["b", code, ...subtags].join("+");
}

export const stringsFileOf = (directory: string) =>
	`${ANDROID_RES}/values-${androidQualifier(directory)}/strings.xml`;

export function declaredStrings(
	files: readonly AndroidFile[],
): Map<string, string> {
	const declared = new Map<string, string>();
	for (const { file, text } of files) {
		for (const [, name = ""] of text.matchAll(DECLARED_STRING)) {
			declared.set(name, file);
		}
	}
	return declared;
}

export function androidDrift({
	english,
	translated,
	existing,
	release,
}: {
	english: AndroidFile;
	translated: readonly AndroidFile[];
	existing: ReadonlyMap<string, string>;
	release: boolean;
}): AndroidDrift {
	const drift: AndroidDrift = {
		errors: [],
		warnings: [],
		writes: [],
		deletes: [],
	};
	const outputs = [english, ...translated];
	for (const output of outputs) {
		const current = existing.get(output.file);
		if (current === output.text) continue;
		drift.writes.push(output);
		if (current === undefined) {
			drift.errors.push(`${output.file} is missing.`);
		} else if (output === english || release) {
			drift.errors.push(`${output.file} is out of date.`);
		} else {
			drift.warnings.push(
				`${output.file}: is out of date, so Android shows older text; run \`bun run gen:i18n\` and commit the result before a release`,
			);
		}
	}
	const owned = new Set(outputs.map(({ file }) => file));
	for (const file of [...existing.keys()].sort()) {
		if (owned.has(file)) continue;
		drift.deletes.push(file);
		drift.errors.push(
			`${file} is for a language that shipped.json doesn’t list.`,
		);
	}
	return drift;
}

function placeholderOrder(english: string): Map<string, number> {
	const names = new Set(
		[...english.matchAll(PLACEHOLDER)].map(([, name = ""]) => name.trim()),
	);
	return new Map([...names].sort().map((name, index) => [name, index + 1]));
}

function escapeLiteral({
	literal,
	formatted,
}: {
	literal: string;
	formatted: boolean;
}): string {
	return literal.replace(ESCAPED, (character) => {
		if (character === "%") return formatted ? "%%" : "%";
		return ESCAPES.get(character) ?? `\\u${hex(character.charCodeAt(0))}`;
	});
}

function androidValue({
	text,
	order,
}: {
	text: string;
	order: ReadonlyMap<string, number>;
}): string | undefined {
	const formatted = order.size > 0;
	const pieces: string[] = [];
	for (const [index, part] of text.split(PLACEHOLDER).entries()) {
		if (index % 2 === 0) {
			pieces.push(escapeLiteral({ literal: part, formatted }));
			continue;
		}
		const position = order.get(part.trim());
		if (position === undefined) return undefined;
		pieces.push(`%${position}$s`);
	}
	const value = `${REFERENCE_START.test(text) ? "\\" : ""}${pieces.join("")}`;
	return NEEDS_QUOTES.test(text) ? `"${value}"` : value;
}

function unstorableCharacter(text: string): string | undefined {
	for (const character of text) {
		const code = character.codePointAt(0) ?? 0;
		if (code >= 0xd800 && code <= 0xdfff) {
			return `a lone surrogate \\u${hex(code)}, which Android cannot store; retype the character`;
		}
		if (code === 0xfffe || code === 0xffff) {
			return `the noncharacter \\u${hex(code)}, which Android cannot store; delete it`;
		}
	}
	return undefined;
}

function element({
	name,
	text,
	order,
}: {
	name: string;
	text: string;
	order: ReadonlyMap<string, number>;
}): string | undefined {
	const value = androidValue({ text, order });
	if (value === undefined) return undefined;
	const plain = order.size === 0 && text.includes("%");
	const attributes = plain ? ' formatted="false"' : "";
	return `\t<string name="${name}"${attributes}>${value}</string>\n`;
}

export function renderAndroidStrings({
	manifest,
	texts,
	english,
}: {
	manifest: AndroidManifest;
	texts: ReadonlyMap<string, string>;
	english: ReadonlyMap<string, string>;
}): RenderedAndroidStrings {
	const lines: string[] = [];
	const errors: string[] = [];
	const names = [...manifest.keys()].sort((a, b) => (a < b ? -1 : 1));
	for (const name of names) {
		const key = manifest.get(name) ?? "";
		const text = texts.get(key) ?? "";
		const source = english.get(key);
		if (text === "" || source === undefined) continue;
		const unstorable = unstorableCharacter(text);
		if (unstorable !== undefined) {
			errors.push(`${key}: has ${unstorable}`);
			continue;
		}
		const line = element({ name, text, order: placeholderOrder(source) });
		if (line !== undefined) lines.push(line);
	}
	return {
		text: [
			'<?xml version="1.0" encoding="utf-8"?>\n',
			"<resources>\n",
			...lines,
			"</resources>\n",
		].join(""),
		errors,
	};
}

export function checkAndroidManifest({
	text,
	messages,
	declared,
}: {
	text: string;
	messages: readonly Message[];
	declared: ReadonlyMap<string, string>;
}): AndroidManifestCheck {
	return checkNativeManifest({
		text,
		messages,
		target: {
			file: MANIFEST,
			names: "Android resource names",
			example: '"push_self": "chat.notification.you"',
			shows: "Android text",
			nameProblem: (name) => {
				if (!RESOURCE_NAME.test(name)) {
					return "is not an Android resource name; use lowercase letters, digits and _, starting with a letter, such as push_self";
				}
				const file = declared.get(name);
				return file === undefined
					? undefined
					: `is also declared in ${file}; rename it here or remove it there`;
			},
		},
	});
}
