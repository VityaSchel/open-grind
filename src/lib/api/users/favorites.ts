import { fetchRest } from "$lib/api/transport";
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
