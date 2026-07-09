import z from "zod";

import { fetchRest } from "$lib/api";
import { registerAccountCache } from "$lib/api/account-caches";
import type { Profile } from "$lib/model/users/profiles";

const getBlockedUsersResponseSchema = z.object({
	blocking: z.array(
		z.object({
			profileId: z.number(),
			blockedTime: z.number(),
		}),
	),
});

let blockedUsersCache: {
	blocking: z.infer<typeof getBlockedUsersResponseSchema>["blocking"];
	updatedAt: number;
} | null = null;

registerAccountCache(() => {
	blockedUsersCache = null;
});

export async function getBlockedUsers() {
	if (
		blockedUsersCache &&
		Date.now() - blockedUsersCache.updatedAt < 1000 * 5
	) {
		return blockedUsersCache.blocking;
	}
	const { blocking } = await fetchRest("/v3.1/me/blocks").then((res) =>
		res.jsonParsed(getBlockedUsersResponseSchema),
	);
	blockedUsersCache = { blocking, updatedAt: Date.now() };
	return blocking;
}

export async function blockUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v3/me/blocks/${profileId}`, {
		method: "POST",
	}).then((res) => res.assertOk());
}

export async function unblockUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await fetchRest(`/v3/me/blocks/${profileId}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
}
