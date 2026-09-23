import type { GridProfile } from "./grid";

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
