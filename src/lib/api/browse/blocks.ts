import z from "zod";

import { registerAccountCache } from "$lib/api/account-caches";
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

export class BlockDidNotStickError extends Error {
	constructor() {
		super(
			"Grindr accepted the block but does not list the profile as blocked",
		);
		this.name = "BlockDidNotStickError";
	}
}

const blockAttempts = new Map<number, object>();
registerAccountCache({ reset: () => blockAttempts.clear() });

export async function blockUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	const attempt = {};
	blockAttempts.set(profileId, attempt);
	const superseded = () => blockAttempts.get(profileId) !== attempt;
	try {
		await blockedUsers.add({
			profileId,
			request: () =>
				fetchRest(`/v3/me/blocks/${profileId}`, {
					method: "POST",
				}).then((res) => res.assertOk()),
		});
		if (superseded()) return;
		const blocking = await getBlockedUsers();
		if (superseded()) return;
		if (!blocking.some((blocked) => blocked.profileId === profileId))
			throw new BlockDidNotStickError();
		markProfileUnviewable(profileId);
	} catch (error) {
		if (!superseded()) throw error;
	} finally {
		if (!superseded()) blockAttempts.delete(profileId);
	}
}

export async function unblockUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	blockAttempts.delete(profileId);
	await blockedUsers.remove({
		profileId,
		request: () =>
			fetchRest(`/v3/me/blocks/${profileId}`, { method: "DELETE" }).then(
				(res) => res.assertOk(),
			),
	});
	markProfileViewable(profileId);
}
