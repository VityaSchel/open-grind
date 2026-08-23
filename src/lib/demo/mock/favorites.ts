import type { FavoriteNote } from "$lib/model/users/favorites";

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

const noteOverrides = new Map<number, FavoriteNote>();

export function demoFavoriteNoteOf({
	profileId,
}: {
	profileId: number;
}): FavoriteNote {
	return noteOverrides.get(profileId) ?? { notes: "", phoneNumber: "" };
}

export function demoSetFavoriteNote({
	profileId,
	note,
}: {
	profileId: number;
	note: FavoriteNote;
}): void {
	noteOverrides.set(profileId, note);
}

export function demoDeleteFavoriteNote({
	profileId,
}: {
	profileId: number;
}): void {
	noteOverrides.delete(profileId);
}

export function demoFavoriteNotes(): (FavoriteNote & {
	counterpartyId: number;
})[] {
	return [...noteOverrides].map(([counterpartyId, note]) => ({
		counterpartyId,
		...note,
	}));
}
