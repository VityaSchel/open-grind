import type { GridProfile, RenderedGridProfile } from "$lib/grid/grid";

export function browseOrder({
	profiles,
	entryId,
	excludeId,
}: {
	profiles: readonly GridProfile[];
	entryId: number;
	excludeId: number;
}): {
	order: number[];
	rows: ReadonlyMap<number, RenderedGridProfile>;
	entryIndex: number;
} {
	const rows = new Map<number, RenderedGridProfile>();
	for (const profile of profiles) {
		if (profile.type === "rendered" && profile.id !== excludeId) {
			rows.set(profile.id, profile);
		}
	}
	const order = [...rows.keys()];
	const entryIndex = order.indexOf(entryId);
	if (entryIndex === -1) {
		return { order: [entryId], rows: new Map(), entryIndex: 0 };
	}
	return { order, rows, entryIndex };
}
