const favoriteOverrides = new Map<number, boolean>();

export function demoSetFavorite({
	profileId,
	favorite,
}: {
	profileId: number;
	favorite: boolean;
}): void {
	favoriteOverrides.set(profileId, favorite);
}

export function demoFavoriteOf({
	profileId,
	seed,
}: {
	profileId: number;
	seed: boolean;
}): boolean {
	return favoriteOverrides.get(profileId) ?? seed;
}
