import type { GridProfile, RenderedGridProfile } from "./grid";

export function dedupeGridProfiles(
	items: readonly GridProfile[],
): GridProfile[] {
	const byId = new Map<number, GridProfile>();
	for (const item of items) {
		const existing = byId.get(item.id);
		if (
			!existing ||
			(existing.type === "lazy" && item.type === "rendered")
		) {
			byId.set(item.id, item);
		}
	}
	return [...byId.values()];
}

export function indexProfilesById(
	profiles: readonly GridProfile[],
): ReadonlyMap<number, number> {
	return new Map(profiles.map((profile, index) => [profile.id, index]));
}

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
