import z from "zod";

import { createRecentlyLifted } from "$lib/api/browse/recently-lifted";
import { FetchCache } from "$lib/api/cache";
import { fetchRest } from "$lib/api/transport";
import {
	markProfileUnviewable,
	markProfileViewable,
} from "$lib/api/users/profile-viewability";
import type { Profile } from "$lib/model/users/profiles";

const getBlockedUsersResponseSchema = z.object({
	blocking: z.array(
		z.object({ profileId: z.number(), blockedTime: z.number() }),
	),
});

type BlockedUsers = z.infer<typeof getBlockedUsersResponseSchema>["blocking"];

const blockedUsers = new FetchCache<null, BlockedUsers>(
	() =>
		fetchRest("/v3.1/me/blocks").then(
			(res) => res.jsonParsed(getBlockedUsersResponseSchema).blocking,
		),
	{ ttlMs: 5_000 },
);

const recentlyUnblocked = createRecentlyLifted();

export function getBlockedUsers(): Promise<BlockedUsers> {
	return blockedUsers.fetch(null);
}

export async function markBlockedProfilesUnviewable(): Promise<void> {
	for (const { profileId } of await getBlockedUsers()) {
		if (recentlyUnblocked.has(profileId)) continue;
		markProfileUnviewable(profileId);
	}
}

export async function blockUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v3/me/blocks/${profileId}`, { method: "POST" }).then(
		(res) => res.assertOk(),
	);
	blockedUsers.clear();
	markProfileUnviewable(profileId);
}

export async function unblockUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v3/me/blocks/${profileId}`, { method: "DELETE" }).then(
		(res) => res.assertOk(),
	);
	recentlyUnblocked.remember(profileId);
	blockedUsers.update(null, (blocking) =>
		blocking.filter((blocked) => blocked.profileId !== profileId),
	);
	markProfileViewable(profileId);
}
