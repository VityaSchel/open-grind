import z from "zod";

import { createRecentlyLifted } from "$lib/api/browse/recently-lifted";
import { FetchCache } from "$lib/api/cache";
import { fetchRest } from "$lib/api/transport";
import {
	markProfileUnviewable,
	markProfileViewable,
} from "$lib/api/users/profile-viewability";
import type { Profile } from "$lib/model/users/profiles";

const getHiddenUsersResponseSchema = z.object({
	hides: z.array(z.object({ profileId: z.coerce.number() })),
});

type HiddenUsers = z.infer<typeof getHiddenUsersResponseSchema>["hides"];

const hiddenUsers = new FetchCache<null, HiddenUsers>(
	() =>
		fetchRest("/v1/hides").then(
			(res) => res.jsonParsed(getHiddenUsersResponseSchema).hides,
		),
	{ ttlMs: 5_000 },
);

const recentlyUnhidden = createRecentlyLifted();

export function getHiddenUsers(): Promise<HiddenUsers> {
	return hiddenUsers.fetch(null);
}

export async function markHiddenProfilesUnviewable(): Promise<void> {
	for (const { profileId } of await getHiddenUsers()) {
		if (recentlyUnhidden.has(profileId)) continue;
		markProfileUnviewable(profileId);
	}
}

export async function hideUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v1/me/hides/${profileId}`, { method: "POST" }).then(
		(res) => res.assertOk(),
	);
	hiddenUsers.clear();
	markProfileUnviewable(profileId);
}

export async function unhideUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v1/hides/${profileId}`, { method: "DELETE" }).then(
		(res) => res.assertOk(),
	);
	recentlyUnhidden.remember(profileId);
	hiddenUsers.update(null, (hides) =>
		hides.filter((hidden) => hidden.profileId !== profileId),
	);
	markProfileViewable(profileId);
}
