import {
	catalogFor,
	LANGUAGE_ALIASES,
	LIKELY_SUBTAGS,
	likelyScript,
	PARENT_LOCALES,
} from "../../src/lib/i18n/matcher";
import { PLACEHOLDER, SOURCE_LOCALE } from "../../src/lib/i18n/syntax";
import {
	checkNativeManifest,
	type NativeManifestCheck,
} from "./native-manifest";
import { isRecord, type Message } from "./source-messages";

export type DesktopManifest = ReadonlyMap<string, string>;

export type Matching = {
	aliases: Record<string, string>;
	likelySubtags: Record<string, string>;
	likelyScripts: Record<string, string | null>;
	parents: Record<string, string>;
};

export type DesktopTexts = Record<string, string>;

export type DesktopStrings = {
	matching: Matching;
	catalogs: Record<string, DesktopTexts>;
};

export type RenderedDesktopTexts = { texts: DesktopTexts; errors: string[] };

export type DesktopDrift = {
	errors: string[];
	warnings: string[];
	write: string | undefined;
};

export const DESKTOP_MANIFEST = "src/lib/i18n/desktop-strings.json";

export const DESKTOP_STRINGS = "src-tauri/src/native_strings/catalogs.json";

export const MATCHER_CASES = "src-tauri/src/native_strings/matcher-cases.json";

const MANIFEST = "desktop-strings.json";

const STRING_NAME = /^[a-z][a-z0-9_]*$/;

const CASE_CATALOGS = [
	"de",
	"en",
	"en-GB",
	"es",
	"es-419",
	"fil",
	"nb",
	"pt-BR",
	"pt-PT",
	"sr",
	"zh-Hans",
	"zh-Hant",
];

const CASE_TAGS = [
	"en",
	"en-US",
	"EN_us",
	"en_US.UTF-8",
	"en-Latn-US",
	"en-US-u-ca-gregory",
	"en-US-posix",
	"en-GB",
	"en-GB-oxendict",
	"en-IN",
	"en-AU",
	"en-DE",
	"en-150",
	"en-001",
	"de",
	"de-AT",
	"de-CH",
	"de_DE@euro",
	"de-Latn-DE",
	"es",
	"es-ES",
	"es-MX",
	"es-419",
	"es_419",
	"es-US",
	"es_AR.UTF-8",
	"pt",
	"pt-BR",
	"pt-PT",
	"pt-AO",
	"pt-MO",
	"zh",
	"zh-CN",
	"zh-Hans-CN",
	"zh-SG",
	"zh-TW",
	"zh-HK",
	"zh-MO",
	"zh-Hant",
	"zh-Hant-HK",
	"cmn-Hans-CN",
	"nb",
	"nb-NO",
	"nn",
	"nn-NO",
	"no",
	"fil",
	"fil-PH",
	"tl",
	"tl-PH",
	"sr",
	"sr-RS",
	"sr-Cyrl-RS",
	"sr-Latn",
	"sr-Latn-RS",
	"sr_RS@latin",
	"sh",
	"hi-Latn",
	"fr",
	"fr-CA",
	"ja-JP",
	"ca-ES-valencia",
	"C",
	"c",
	"POSIX",
	"und",
	"",
	"x",
	"en-",
	"-en",
	"1en",
	"en--US",
];

const LONE_SURROGATE = /\p{Cs}/u;

const hex = (code: number) => code.toString(16).toUpperCase().padStart(4, "0");

const sameJson = (a: unknown, b: unknown) =>
	JSON.stringify(a) === JSON.stringify(b);

export const renderJson = (value: unknown) =>
	`${JSON.stringify(value, null, "\t")}\n`;

export function checkDesktopManifest({
	text,
	messages,
}: {
	text: string;
	messages: readonly Message[];
}): NativeManifestCheck {
	return checkNativeManifest({
		text,
		messages,
		target: {
			file: MANIFEST,
			names: "desktop string names",
			example: '"google_sign_in_title": "auth.signIn.google.title"',
			shows: "desktop text",
			nameProblem: (name) =>
				STRING_NAME.test(name)
					? undefined
					: "is not a desktop string name; use lowercase letters, digits and _, starting with a letter, such as google_sign_in_title",
		},
	});
}

const languageOf = (tag: string) => new Intl.Locale(tag).language;

function reachable(language: string): Set<string> {
	const reached = new Set([language]);
	for (const current of reached) {
		for (const [child, parent] of PARENT_LOCALES) {
			if (languageOf(child) === current) reached.add(languageOf(parent));
		}
	}
	return reached;
}

function matchedLanguages(catalogs: readonly string[]): string[] {
	const targets = new Set(
		catalogs.flatMap((catalog) => [...reachable(languageOf(catalog))]),
	);
	const candidates = new Set([
		...targets,
		...[...PARENT_LOCALES.keys()].map(languageOf),
	]);
	return [...candidates]
		.filter((language) =>
			[...reachable(language)].some((reached) => targets.has(reached)),
		)
		.sort();
}

export function matchingData(catalogs: readonly string[]): Matching {
	return {
		aliases: Object.fromEntries(LANGUAGE_ALIASES),
		likelySubtags: Object.fromEntries(LIKELY_SUBTAGS),
		likelyScripts: Object.fromEntries(
			matchedLanguages(catalogs).map((language) => [
				language,
				likelyScript(language) ?? null,
			]),
		),
		parents: Object.fromEntries(PARENT_LOCALES),
	};
}

export function renderDesktopTexts({
	manifest,
	texts,
	english,
}: {
	manifest: DesktopManifest;
	texts: ReadonlyMap<string, string>;
	english: ReadonlyMap<string, string>;
}): RenderedDesktopTexts {
	const rendered: RenderedDesktopTexts = { texts: {}, errors: [] };
	const names = [...manifest.keys()].sort((a, b) => (a < b ? -1 : 1));
	for (const name of names) {
		const key = manifest.get(name) ?? "";
		const text = texts.get(key) ?? "";
		if (text === "" || !english.has(key)) continue;
		const surrogate = LONE_SURROGATE.exec(text)?.[0];
		if (surrogate !== undefined) {
			rendered.errors.push(
				`${key}: has a lone surrogate \\u${hex(surrogate.charCodeAt(0))}, which the desktop app cannot read; retype the character`,
			);
			continue;
		}
		rendered.texts[name] = text.replace(
			PLACEHOLDER,
			(_, placeholder: string) => `{{${placeholder.trim()}}}`,
		);
	}
	return rendered;
}

function previousStrings(
	text: string,
): { matching: unknown; catalogs: Record<string, unknown> } | undefined {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!isRecord(json) || !isRecord(json.catalogs)) return undefined;
	return { matching: json.matching, catalogs: json.catalogs };
}

export function desktopDrift({
	rendered,
	existing,
	release,
}: {
	rendered: DesktopStrings;
	existing: string | undefined;
	release: boolean;
}): DesktopDrift {
	const text = renderJson(rendered);
	const drift: DesktopDrift = { errors: [], warnings: [], write: undefined };
	if (existing === text) return drift;
	drift.write = text;
	if (existing === undefined) {
		drift.errors.push(`${DESKTOP_STRINGS} is missing.`);
		return drift;
	}
	const previous = previousStrings(existing);
	const outOfDate = `${DESKTOP_STRINGS} is out of date.`;
	if (previous === undefined) {
		drift.errors.push(outOfDate);
		return drift;
	}
	if (
		!sameJson(previous.matching, rendered.matching) ||
		!sameJson(
			previous.catalogs[SOURCE_LOCALE],
			rendered.catalogs[SOURCE_LOCALE],
		)
	) {
		drift.errors.push(outOfDate);
	}
	for (const [locale, texts] of Object.entries(rendered.catalogs)) {
		if (locale === SOURCE_LOCALE) continue;
		const before = previous.catalogs[locale];
		if (before === undefined) {
			drift.errors.push(`${DESKTOP_STRINGS}: ${locale} is missing.`);
		} else if (sameJson(before, texts)) {
			continue;
		} else if (release) {
			drift.errors.push(`${DESKTOP_STRINGS}: ${locale} is out of date.`);
		} else {
			drift.warnings.push(
				`${DESKTOP_STRINGS}: ${locale} is out of date, so the desktop app shows older text; run \`bun run gen:i18n\` and commit the result before a release`,
			);
		}
	}
	for (const locale of Object.keys(previous.catalogs).sort()) {
		if (locale in rendered.catalogs) continue;
		drift.errors.push(
			`${DESKTOP_STRINGS}: ${locale} is for a language that shipped.json doesn’t list.`,
		);
	}
	if (drift.errors.length === 0 && drift.warnings.length === 0) {
		drift.errors.push(outOfDate);
	}
	return drift;
}

export function renderMatcherCases(): string {
	const offered = { catalogs: CASE_CATALOGS, pseudo: [] };
	return renderJson({
		catalogs: CASE_CATALOGS,
		matching: matchingData(CASE_CATALOGS),
		cases: CASE_TAGS.map((tag) => [
			tag,
			catalogFor({ tag, offered }) ?? null,
		]),
	});
}
