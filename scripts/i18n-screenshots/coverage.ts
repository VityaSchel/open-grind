import { join } from "node:path";

import { PLURAL_KEY } from "../../src/lib/i18n/syntax";
import {
	type CompositeButton,
	compositeButtons,
	englishMeasured,
} from "./labels";
import type { Captured } from "./manifest";

const SOURCE_DIR = Bun.fileURLToPath(
	new URL("../../src/lib/i18n/locales/en", import.meta.url),
);
const FIXTURE_DIR = Bun.fileURLToPath(
	new URL("../../src/lib/demo/mock", import.meta.url),
);
const UNCAPTURABLE = new URL("uncapturable.json", import.meta.url);
const LETTER = /\p{L}/gu;
const DIGIT = /\p{Nd}/u;
const MIN_LETTERS = 2;
const BRAND_NAMES = new Set(["Grindr", "Open Grind", "OpenStreetMap"]);

type CatalogJson = string | { [key: string]: CatalogJson };

export type Coverage = {
	commit: string;
	keys: number;
	shown: number;
	uncapturable: number;
	missing: string[];
	unmarked: Record<string, string[]>;
	staleUncapturable: string[];
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

async function sourceKeys(): Promise<string[]> {
	const keys = new Set<string>();
	for await (const file of new Bun.Glob("*.json").scan(SOURCE_DIR)) {
		const json = (await Bun.file(
			join(SOURCE_DIR, file),
		).json()) as CatalogJson;
		flatten({ json, key: file.replace(/\.json$/, ""), into: keys });
	}
	return [...keys].sort();
}

async function fixtureText(): Promise<string> {
	const sources: string[] = [];
	for await (const file of new Bun.Glob("*.ts").scan(FIXTURE_DIR)) {
		if (!file.endsWith(".test.ts")) {
			sources.push(await Bun.file(join(FIXTURE_DIR, file)).text());
		}
	}
	return sources.join("\n");
}

function matches({ key, pattern }: { key: string; pattern: string }): boolean {
	return pattern.endsWith(".*")
		? key.startsWith(pattern.slice(0, -1))
		: key === pattern;
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

export async function writeCoverage({
	outDir,
	commit,
	captured,
}: {
	outDir: string;
	commit: string;
	captured: Captured;
}): Promise<Coverage> {
	const keys = await sourceKeys();
	const patterns = Object.keys(
		(await Bun.file(UNCAPTURABLE).json()) as Record<string, string>,
	);
	const fixtures = await fixtureText();
	const shown = new Set(
		Object.values(captured.views).flatMap((view) =>
			view.keys.map(({ key }) => key),
		),
	);
	const uncapturable = keys.filter((key) =>
		patterns.some((pattern) => matches({ key, pattern })),
	);
	const unmarked = Object.fromEntries(
		Object.entries(captured.unmarked)
			.map(([id, texts]): [string, string[]] => [
				id,
				texts.filter((text) => worthReporting({ text, fixtures })),
			])
			.filter(([, texts]) => texts.length > 0),
	);
	const coverage: Coverage = {
		commit,
		keys: keys.length,
		shown: keys.filter((key) => shown.has(key)).length,
		uncapturable: uncapturable.length,
		missing: keys.filter(
			(key) => !shown.has(key) && !uncapturable.includes(key),
		),
		unmarked,
		staleUncapturable: patterns.filter(
			(pattern) => !keys.some((key) => matches({ key, pattern })),
		),
		englishMeasured: englishMeasured(captured),
		compositeButtons: compositeButtons(captured),
	};
	await Bun.write(
		join(outDir, "coverage.json"),
		`${JSON.stringify(coverage, null, "\t")}\n`,
	);
	return coverage;
}
