import type { View } from "./manifest";

export type KeyTally = {
	shown: number;
	uncapturable: number;
	missing: string[];
	staleUncapturable: string[];
};

export type Uncapturable = Record<
	string,
	{ reason: string; explanation: string }
>;

function matches({ key, pattern }: { key: string; pattern: string }): boolean {
	return pattern.endsWith(".*")
		? key.startsWith(pattern.slice(0, -1))
		: key === pattern;
}

function specificity(pattern: string): number {
	return pattern.endsWith(".*") ? pattern.length - 1 : pattern.length;
}

export function shownKeys(views: View[]): Set<string> {
	return new Set(views.flatMap((view) => view.keys.map(({ key }) => key)));
}

export function explainKeys({
	keys,
	uncapturable,
	shown,
}: {
	keys: string[];
	uncapturable: Uncapturable;
	shown: ReadonlySet<string>;
}): Record<string, string> {
	const entries = Object.entries(uncapturable).sort(
		([a], [b]) => specificity(b) - specificity(a),
	);
	return Object.fromEntries(
		keys.flatMap((key) => {
			if (shown.has(key)) return [];
			const entry = entries.find(([pattern]) =>
				matches({ key, pattern }),
			);
			return entry === undefined ? [] : [[key, entry[1].explanation]];
		}),
	);
}

export function tallyKeys({
	keys,
	patterns,
	shown,
}: {
	keys: string[];
	patterns: string[];
	shown: ReadonlySet<string>;
}): KeyTally {
	const uncapturable = keys.filter((key) =>
		patterns.some((pattern) => matches({ key, pattern })),
	);
	return {
		shown: keys.filter((key) => shown.has(key)).length,
		uncapturable: uncapturable.length,
		missing: keys.filter(
			(key) => !shown.has(key) && !uncapturable.includes(key),
		),
		staleUncapturable: patterns.filter(
			(pattern) => !keys.some((key) => matches({ key, pattern })),
		),
	};
}
