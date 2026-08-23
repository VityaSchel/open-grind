import { FetchCache } from "$lib/api/cache";
import { fetchRest } from "$lib/api/transport";
import {
	type FavoriteNote,
	favoriteNoteSchema,
	favoriteNotesResponseSchema,
} from "$lib/model/users/favorites";
import type { Profile } from "$lib/model/users/profiles";

export async function addFavoriteUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v3/me/favorites/${profileId}`, { method: "POST" }).then(
		(res) => res.assertOk(),
	);
}

export async function removeFavoriteUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v3/me/favorites/${profileId}`, { method: "DELETE" }).then(
		(res) => res.assertOk(),
	);
}

const notes = new FetchCache<Profile["profileId"], FavoriteNote>(
	(profileId) =>
		fetchRest(`/v1/favorites/notes/${profileId}`).then((res) =>
			res.jsonParsed(favoriteNoteSchema),
		),
	{ ttlMs: 60_000 },
);

export async function getFavoriteNote({
	profileId,
}: {
	profileId: Profile["profileId"];
}): Promise<FavoriteNote> {
	return await notes.fetch(profileId);
}

export function invalidateFavoriteNote({
	profileId,
}: {
	profileId: Profile["profileId"];
}): void {
	notes.delete(profileId);
}

export async function getFavoriteNotes() {
	return await fetchRest("/v1/favorites/notes").then((res) =>
		res.jsonParsed(favoriteNotesResponseSchema),
	);
}

export async function putFavoriteNote({
	profileId,
	note,
}: {
	profileId: Profile["profileId"];
	note: FavoriteNote;
}) {
	await fetchRest(`/v1/favorites/notes/${profileId}`, {
		method: "PUT",
		body: note,
	}).then((res) => res.assertOk());
	notes.set(profileId, note);
}

export async function replaceFavoriteNotes({
	notes: replacement,
}: {
	notes: (FavoriteNote & { counterpartyId: Profile["profileId"] })[];
}) {
	await fetchRest("/v1/favorites/notes", {
		method: "PUT",
		body: { notes: replacement },
	}).then((res) => res.assertOk());
	for (const { counterpartyId, ...note } of replacement)
		notes.set(counterpartyId, note);
}

export async function deleteFavoriteNote({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v1/favorites/notes/${profileId}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
	notes.set(profileId, { notes: "", phoneNumber: "" });
}
