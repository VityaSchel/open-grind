import type { View } from "./manifest";

export type KeyTally = {
	shown: number;
	uncapturable: number;
	missing: string[];
	staleUncapturable: string[];
};

function matches({ key, pattern }: { key: string; pattern: string }): boolean {
	return pattern.endsWith(".*")
		? key.startsWith(pattern.slice(0, -1))
		: key === pattern;
}

export function tallyKeys({
	keys,
	patterns,
	views,
}: {
	keys: string[];
	patterns: string[];
	views: View[];
}): KeyTally {
	const shown = new Set(
		views.flatMap((view) => view.keys.map(({ key }) => key)),
	);
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
