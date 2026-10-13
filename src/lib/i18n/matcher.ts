import { DEFAULT_LOCALE, SOURCE_LOCALE } from "./syntax";

export type Offered = {
	readonly catalogs: readonly string[];
	readonly pseudo: readonly string[];
};

export type Resolution = { readonly locale: string; readonly catalog: string };

type Subtags = {
	readonly language: string;
	readonly script: string | undefined;
	readonly region: string | undefined;
};

const POSIX_LOCALE = /^([^.@]*)(?:\.[^@]*)?(?:@(.*))?$/;

const UNSPECIFIED_LANGUAGES = new Set(["posix", "und"]);

const LANGUAGE_ALIASES = new Map([
	["cmn", "zh"],
	["sh", "sr-Latn"],
	["tl", "fil"],
]);

const LIKELY_SUBTAGS = new Map([
	["en", "en-Latn-US"],
	["es", "es-Latn-ES"],
	["pt", "pt-Latn-BR"],
	["zh", "zh-Hans-CN"],
	["zh-HK", "zh-Hant-HK"],
	["zh-MO", "zh-Hant-MO"],
	["zh-Hant", "zh-Hant-TW"],
	["zh-TW", "zh-Hant-TW"],
]);

function children({
	language,
	regions,
	parent,
}: {
	language: string;
	regions: string;
	parent: string;
}): [string, string][] {
	return regions
		.split(" ")
		.map((region) => [`${language}-${region}`, parent]);
}

const PARENT_LOCALES = new Map([
	...children({
		language: "es",
		regions:
			"AR BO BR BZ CL CO CR CU DO EC GT HN JP MX NI PA PE PR PY SV US UY VE",
		parent: "es-419",
	}),
	...children({
		language: "pt",
		regions: "AO CH CV FR GQ GW LU MO MZ ST TL",
		parent: "pt-PT",
	}),
	...children({
		language: "en",
		regions:
			"150 AG AI AU BB BM BS BW BZ CC CK CM CX CY DG DM ER FJ FK FM GB GD GG GH GI GM GS GY HK ID IE IL IM IN IO JE JM KE KI KN KY LC LR LS MG MO MS MT MU MV MW MY NA NF NG NR NU NZ PG PK PN PW RW SB SC SD SG SH SL SS SX SZ TC TK TO TT TV TZ UG VC VG VU WS ZA ZM ZW",
		parent: "en-001",
	}),
	...children({
		language: "en",
		regions:
			"AT BE CH CZ DE DK EE ES FI FR GE HU IT LT LV NL NO PL PT RO SE SI SK UA",
		parent: "en-150",
	}),
	["nb", "no"],
	["nn", "no"],
]);

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

export function normalizeTag(raw: string): string | undefined {
	const [, base = "", modifier] = POSIX_LOCALE.exec(raw) ?? [];
	let locale: Intl.Locale;
	try {
		locale = new Intl.Locale(base.replaceAll("_", "-"));
	} catch {
		return undefined;
	}
	const [language = ""] = locale.baseName.split("-");
	if (UNSPECIFIED_LANGUAGES.has(language)) return undefined;
	const alias = LANGUAGE_ALIASES.get(language);
	const latin = modifier?.toLowerCase() === "latin" ? "Latn" : undefined;
	if (alias === undefined && latin === undefined) return locale.baseName;
	const target = new Intl.Locale(alias ?? language);
	return new Intl.Locale(target.language, {
		script: locale.script ?? target.script ?? latin,
		region: locale.region,
	}).baseName;
}

function subtagsOf(tag: string): Subtags {
	const { language, script, region } = new Intl.Locale(tag);
	return { language, script, region };
}

function withLikelySubtags({ language, script, region }: Subtags): Subtags {
	const keys = [
		script === undefined ? undefined : `${language}-${script}`,
		region === undefined ? undefined : `${language}-${region}`,
		language,
	];
	const likely = keys
		.map((key) => (key === undefined ? undefined : LIKELY_SUBTAGS.get(key)))
		.find(isDefined);
	if (likely === undefined) return { language, script, region };
	const filled = new Intl.Locale(likely);
	return {
		language,
		script: script ?? filled.script,
		region: region ?? filled.region,
	};
}

const likelyScripts = new Map<string, string | undefined>();

function likelyScript(language: string): string | undefined {
	if (!likelyScripts.has(language)) {
		const known = LIKELY_SUBTAGS.get(language);
		const likely =
			known === undefined
				? new Intl.Locale(language).maximize()
				: new Intl.Locale(known);
		likelyScripts.set(language, likely.script);
	}
	return likelyScripts.get(language);
}

function localeKey(tag: string): string {
	const { language, script, region } = withLikelySubtags(subtagsOf(tag));
	const ownScript = script === likelyScript(language) ? undefined : script;
	return [language, ownScript, region].filter(isDefined).join("-");
}

function writingSystem(tag: string): string {
	const { language, script } = withLikelySubtags(subtagsOf(tag));
	return [language, script ?? likelyScript(language)]
		.filter(isDefined)
		.join("-");
}

function parentOf(key: string): string | undefined {
	const explicit = PARENT_LOCALES.get(key);
	if (explicit !== undefined) return explicit;
	const { language, script, region } = new Intl.Locale(key);
	if (region === undefined) return undefined;
	return script === undefined ? language : `${language}-${script}`;
}

const lineages = new Map<string, readonly string[]>();

function lineage(tag: string): readonly string[] {
	const cached = lineages.get(tag);
	if (cached !== undefined) return cached;
	const chain: string[] = [];
	let key: string | undefined = localeKey(tag);
	while (key !== undefined && !chain.includes(key)) {
		chain.push(key);
		key = parentOf(key);
	}
	lineages.set(tag, chain);
	return chain;
}

function isDefaultContent(catalog: string): boolean {
	const { language } = new Intl.Locale(catalog);
	return localeKey(catalog) === localeKey(language);
}

function regularCatalogs(offered: Offered): string[] {
	return offered.catalogs.filter(
		(catalog) => !offered.pseudo.includes(catalog),
	);
}

function distance({
	wanted,
	catalog,
}: {
	wanted: readonly string[];
	catalog: string;
}): number | undefined {
	const own = lineage(catalog);
	const shared = wanted.find((key) => own.includes(key));
	return shared === undefined
		? undefined
		: wanted.indexOf(shared) + own.indexOf(shared);
}

export function catalogFor({
	tag,
	offered,
}: {
	tag: string;
	offered: Offered;
}): string | undefined {
	const normalized = normalizeTag(tag);
	if (normalized === undefined) return undefined;
	if (offered.catalogs.includes(normalized)) return normalized;
	if (offered.pseudo.includes(normalized)) return undefined;
	const wanted = lineage(normalized);
	let best: { catalog: string; distance: number } | undefined;
	for (const catalog of regularCatalogs(offered)) {
		const score = distance({ wanted, catalog });
		if (score === undefined) continue;
		if (
			best === undefined ||
			score < best.distance ||
			(score === best.distance &&
				isDefaultContent(catalog) &&
				!isDefaultContent(best.catalog))
		) {
			best = { catalog, distance: score };
		}
	}
	return best?.catalog;
}

export function messageChain({
	catalog,
	offered,
}: {
	catalog: string;
	offered: Offered;
}): string[] {
	if (catalog === SOURCE_LOCALE) return [SOURCE_LOCALE];
	if (offered.pseudo.includes(catalog)) return [catalog, SOURCE_LOCALE];
	const regular = regularCatalogs(offered);
	const ancestors = lineage(catalog)
		.slice(1)
		.map((key) =>
			regular.find((other) => localeKey(other) === localeKey(key)),
		);
	const siblings = regular.filter(
		(other) => writingSystem(other) === writingSystem(catalog),
	);
	const chain = [catalog, ...ancestors, ...siblings, SOURCE_LOCALE]
		.filter(isDefined)
		.filter((id, index, all) => all.indexOf(id) === index);
	return chain.slice(0, chain.indexOf(SOURCE_LOCALE) + 1);
}

export function pickerTag(catalog: string): string {
	const { language, script, region } = subtagsOf(catalog);
	const likely = LIKELY_SUBTAGS.get(language);
	if (script !== undefined || region !== undefined || likely === undefined) {
		return catalog;
	}
	return `${language}-${new Intl.Locale(likely).region}`;
}

export function resolveLocale({
	choice,
	system,
	offered,
}: {
	choice: string | null;
	system: readonly string[];
	offered: Offered;
}): Resolution {
	const systemTags = system.map(normalizeTag).filter(isDefined);
	const chosen = choice === null ? undefined : normalizeTag(choice);
	const chosenCatalog =
		chosen === undefined ? undefined : catalogFor({ tag: chosen, offered });
	if (chosen !== undefined && chosenCatalog !== undefined) {
		const twin =
			chosen === pickerTag(chosenCatalog)
				? systemTags.find(
						(tag) => catalogFor({ tag, offered }) === chosenCatalog,
					)
				: undefined;
		return { locale: twin ?? chosen, catalog: chosenCatalog };
	}
	for (const tag of systemTags) {
		const catalog = catalogFor({ tag, offered });
		if (catalog !== undefined) return { locale: tag, catalog };
	}
	return { locale: DEFAULT_LOCALE, catalog: SOURCE_LOCALE };
}
