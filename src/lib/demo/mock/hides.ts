const hiddenIds = new Set<number>();

export function demoHiddenUsers(): { profileId: number }[] {
	return idsOutOfHidingOrderLikeTheServer().map((profileId) => ({
		profileId,
	}));
}

function idsOutOfHidingOrderLikeTheServer(): number[] {
	const [oldestHidden, ...newerHidden] = hiddenIds;
	return oldestHidden === undefined ? [] : [...newerHidden, oldestHidden];
}

export function demoSetHidden({
	profileId,
	hidden,
}: {
	profileId: number;
	hidden: boolean;
}): void {
	if (hidden) hiddenIds.add(profileId);
	else hiddenIds.delete(profileId);
}

export function demoProfileHidden(profileId: number): boolean {
	return hiddenIds.has(profileId);
}
