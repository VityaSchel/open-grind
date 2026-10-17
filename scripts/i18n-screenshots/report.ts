import { PLURAL_KEY } from "../../src/lib/i18n/syntax";
import {
	type CompositeButton,
	compositeButtons,
	englishMeasured,
} from "./labels";
import { byCodeUnits, type Captured } from "./manifest";
import { explainKeys, shownKeys, tallyKeys, type Uncapturable } from "./tally";

const LETTER = /\p{L}/gu;
const DIGIT = /\p{Nd}/u;
const MIN_LETTERS = 2;
const BRAND_NAMES = new Set(["Grindr", "Open Grind", "OpenStreetMap"]);

export type CatalogJson = string | { [key: string]: CatalogJson };

export type Coverage = {
	commit: string;
	keys: number;
	shown: number;
	uncapturable: number;
	missing: string[];
	unmarked: Record<string, string[]>;
	staleUncapturable: string[];
	explanations: Record<string, string>;
	englishMeasured: string[];
	compositeButtons: CompositeButton[];
};

function flatten({
	json,
	key,
	into,
}: {
	json: CatalogJson;
	key: string;
	into: Set<string>;
}): void {
	if (typeof json === "string") {
		into.add(PLURAL_KEY.exec(key)?.[1] ?? key);
		return;
	}
	for (const [segment, child] of Object.entries(json)) {
		flatten({ json: child, key: `${key}.${segment}`, into });
	}
}

function catalogKeys(catalogs: Record<string, CatalogJson>): string[] {
	const keys = new Set<string>();
	for (const [namespace, json] of Object.entries(catalogs)) {
		flatten({ json, key: namespace, into: keys });
	}
	return [...keys].sort(byCodeUnits);
}

function worthReporting({
	text,
	fixtures,
}: {
	text: string;
	fixtures: string;
}): boolean {
	if (DIGIT.test(text) || BRAND_NAMES.has(text)) return false;
	const letters = text.match(LETTER)?.length ?? 0;
	return letters >= MIN_LETTERS && !fixtures.includes(text);
}

export function coverageReport({
	commit,
	catalogs,
	uncapturable,
	fixtures,
	captured,
}: {
	commit: string;
	catalogs: Record<string, CatalogJson>;
	uncapturable: Uncapturable;
	fixtures: string;
	captured: Captured;
}): Coverage {
	const keys = catalogKeys(catalogs);
	const shown = shownKeys(Object.values(captured.views));
	const tally = tallyKeys({
		keys,
		patterns: Object.keys(uncapturable),
		shown,
	});
	const unmarked = Object.fromEntries(
		Object.entries(captured.unmarked)
			.map(([id, texts]): [string, string[]] => [
				id,
				texts.filter((text) => worthReporting({ text, fixtures })),
			])
			.filter(([, texts]) => texts.length > 0),
	);
	return {
		commit,
		keys: keys.length,
		shown: tally.shown,
		uncapturable: tally.uncapturable,
		missing: tally.missing,
		unmarked,
		staleUncapturable: tally.staleUncapturable,
		explanations: explainKeys({ keys, uncapturable, shown }),
		englishMeasured: englishMeasured(captured),
		compositeButtons: compositeButtons(captured),
	};
}
