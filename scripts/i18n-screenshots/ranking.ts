import type { ShownKey } from "../../src/lib/demo/screenshot-scan";
import { byCodeUnits } from "./manifest";

export const HIGHLIGHTS_PER_KEY = 3;

export type RankedViews = Record<string, { keys: ShownKey[]; screen?: string }>;

type Placement = {
	viewId: string;
	screen: string;
	shown: ShownKey;
	namespaceKeys: number;
	topKeys: number;
};

function namespaceOf(key: string): string {
	return key.replace(/\..*$/, "");
}

function comparePlacements(a: Placement, b: Placement): number {
	return (
		Number(b.shown.top) - Number(a.shown.top) ||
		Number(b.shown.via === "text") - Number(a.shown.via === "text") ||
		a.namespaceKeys - b.namespaceKeys ||
		byCodeUnits(a.viewId, b.viewId)
	);
}

function compareOnScreen(a: Placement, b: Placement): number {
	return a.topKeys - b.topKeys || comparePlacements(a, b);
}

function countNamespaces(keys: ShownKey[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const { key } of keys) {
		const namespace = namespaceOf(key);
		counts.set(namespace, (counts.get(namespace) ?? 0) + 1);
	}
	return counts;
}

function countTopKeys(keys: ShownKey[]): number {
	return new Set(keys.filter(({ top }) => top).map(({ key }) => key)).size;
}

function onePerScreen(placed: Placement[]): Placement[] {
	const standing = placed.filter(({ shown }) => shown.top);
	const kept = new Map<string, Placement>();
	for (const placement of placed) {
		if (placement.shown.top) continue;
		const earlier = kept.get(placement.screen);
		if (earlier === undefined || compareOnScreen(placement, earlier) < 0) {
			kept.set(placement.screen, placement);
		}
	}
	return [...standing, ...kept.values()];
}

export function rankViews(views: RankedViews): Map<string, string[]> {
	const placements = new Map<string, Placement[]>();
	for (const [viewId, { keys, screen = viewId }] of Object.entries(views)) {
		const namespaces = countNamespaces(keys);
		const topKeys = countTopKeys(keys);
		for (const shown of keys) {
			const namespaceKeys = namespaces.get(namespaceOf(shown.key)) ?? 0;
			const placed = placements.get(shown.key) ?? [];
			placed.push({ viewId, screen, shown, namespaceKeys, topKeys });
			placements.set(shown.key, placed);
		}
	}
	return new Map(
		[...placements].map(([key, placed]) => [
			key,
			onePerScreen(placed)
				.sort(comparePlacements)
				.map(({ viewId }) => viewId),
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
