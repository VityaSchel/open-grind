import { join } from "node:path";

import type { Captured } from "./manifest";
import { type CatalogJson, type Coverage, coverageReport } from "./report";
import type { Uncapturable } from "./tally";

const SOURCE_DIR = Bun.fileURLToPath(
	new URL("../../src/lib/i18n/locales/en", import.meta.url),
);
const FIXTURE_DIR = Bun.fileURLToPath(
	new URL("../../src/lib/demo/mock", import.meta.url),
);
const UNCAPTURABLE = new URL("uncapturable.json", import.meta.url);

async function sourceCatalogs(): Promise<Record<string, CatalogJson>> {
	const catalogs: Record<string, CatalogJson> = {};
	for await (const file of new Bun.Glob("*.json").scan(SOURCE_DIR)) {
		catalogs[file.replace(/\.json$/, "")] = (await Bun.file(
			join(SOURCE_DIR, file),
		).json()) as CatalogJson;
	}
	return catalogs;
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

export async function writeCoverage({
	outDir,
	commit,
	captured,
	sceneData,
}: {
	outDir: string;
	commit: string;
	captured: Captured;
	sceneData: unknown;
}): Promise<Coverage> {
	const coverage = coverageReport({
		commit,
		catalogs: await sourceCatalogs(),
		uncapturable: (await Bun.file(UNCAPTURABLE).json()) as Uncapturable,
		fixtures: await fixtureText(),
		sceneData,
		captured,
	});
	await Bun.write(
		join(outDir, "coverage.json"),
		`${JSON.stringify(coverage, null, "\t")}\n`,
	);
	return coverage;
}
