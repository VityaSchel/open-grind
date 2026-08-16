const hiddenIds = new Set<number>();

export function demoHiddenUsers(): { profileId: number }[] {
	return [...hiddenIds].map((profileId) => ({ profileId }));
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
