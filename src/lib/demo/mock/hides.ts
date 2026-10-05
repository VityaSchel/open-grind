const hiddenIds = new Set<number>();

// Grindr lists hides in no stable order, so the demo keeps them out of the
// order they were hidden in.
export function demoHiddenUsers(): { profileId: number }[] {
	const [oldest, ...newer] = hiddenIds;
	const listed = oldest === undefined ? [] : [...newer, oldest];
	return listed.map((profileId) => ({ profileId }));
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
