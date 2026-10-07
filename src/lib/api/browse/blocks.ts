import z from "zod";

import { EditableServerList } from "$lib/api/browse/editable-server-list";
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

const blockedUsers = new EditableServerList({
	request: () =>
		fetchRest("/v3.1/me/blocks").then(
			(res) => res.jsonParsed(getBlockedUsersResponseSchema).blocking,
		),
	ttlMs: 5_000,
});

export function getBlockedUsers(): Promise<BlockedUsers> {
	return blockedUsers.entries();
}

export async function markBlockedProfilesUnviewable(): Promise<void> {
	for (const { profileId } of await getBlockedUsers())
		markProfileUnviewable(profileId);
}

export async function blockUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await blockedUsers.add({
		profileId,
		request: () =>
			fetchRest(`/v3/me/blocks/${profileId}`, { method: "POST" }).then(
				(res) => res.assertOk(),
			),
	});
	markProfileUnviewable(profileId);
}

export async function unblockUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await blockedUsers.remove({
		profileId,
		request: () =>
			fetchRest(`/v3/me/blocks/${profileId}`, { method: "DELETE" }).then(
				(res) => res.assertOk(),
			),
	});
	markProfileViewable(profileId);
}
