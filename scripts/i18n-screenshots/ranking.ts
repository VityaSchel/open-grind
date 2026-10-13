import type { ShownKey } from "../../src/lib/demo/screenshot-scan";

export const HIGHLIGHTS_PER_KEY = 3;

export type RankedViews = Record<string, { keys: ShownKey[] }>;

type Placement = { viewId: string; shown: ShownKey; namespaceKeys: number };

function namespaceOf(key: string): string {
	return key.replace(/\..*$/, "");
}

function byCodeUnits(a: string, b: string): number {
	if (a === b) return 0;
	return a < b ? -1 : 1;
}

function comparePlacements(a: Placement, b: Placement): number {
	return (
		Number(b.shown.top) - Number(a.shown.top) ||
		Number(b.shown.via === "text") - Number(a.shown.via === "text") ||
		a.namespaceKeys - b.namespaceKeys ||
		byCodeUnits(a.viewId, b.viewId)
	);
}

function countNamespaces(keys: ShownKey[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const { key } of keys) {
		const namespace = namespaceOf(key);
		counts.set(namespace, (counts.get(namespace) ?? 0) + 1);
	}
	return counts;
}

export function rankViews(views: RankedViews): Map<string, string[]> {
	const placements = new Map<string, Placement[]>();
	for (const [viewId, { keys }] of Object.entries(views)) {
		const namespaces = countNamespaces(keys);
		for (const shown of keys) {
			const namespaceKeys = namespaces.get(namespaceOf(shown.key)) ?? 0;
			const placed = placements.get(shown.key) ?? [];
			placed.push({ viewId, shown, namespaceKeys });
			placements.set(shown.key, placed);
		}
	}
	return new Map(
		[...placements].map(([key, placed]) => [
			key,
			placed.sort(comparePlacements).map(({ viewId }) => viewId),
		]),
	);
}

export function chooseHighlights(views: RankedViews): Map<string, Set<string>> {
	const chosen = new Map<string, Set<string>>();
	for (const [key, ranked] of rankViews(views)) {
		for (const viewId of ranked.slice(0, HIGHLIGHTS_PER_KEY)) {
			const keys = chosen.get(viewId) ?? new Set<string>();
			keys.add(key);
			chosen.set(viewId, keys);
		}
	}
	return chosen;
}
