import { PLURAL_CATEGORIES, SOURCE_LOCALE } from "../../src/lib/i18n/syntax";

export type PluralForms = {
	offered: readonly string[];
	singleNumber: ReadonlySet<string>;
	sourceCategories: ReadonlyMap<string, ReadonlySet<string>>;
};

function* weblateSampleCounts(): Generator<number> {
	for (let count = 0; count < 10_000; count++) yield count;
	for (let count = 10_000; count <= 2_000_000; count += 1000) yield count;
}

export function weblatePluralForms(locale: string): PluralForms {
	const rules = new Intl.PluralRules(locale);
	const samples = new Map<string, number[]>();
	for (const count of weblateSampleCounts()) {
		const category = rules.select(count);
		const counts = samples.get(category) ?? [];
		if (counts.length < 3) samples.set(category, [...counts, count]);
	}
	const offered = PLURAL_CATEGORIES.filter((category) =>
		samples.has(category),
	);
	const singleNumber = offered.filter(
		(category) => samples.get(category)?.length === 1,
	);
	const source = new Intl.PluralRules(SOURCE_LOCALE);
	const sourceCategories = new Map<string, ReadonlySet<string>>();
	for (const [category, counts] of samples) {
		const selected = counts.map((count) => source.select(count));
		sourceCategories.set(category, new Set(selected));
	}
	return { offered, singleNumber: new Set(singleNumber), sourceCategories };
}
