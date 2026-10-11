import z from "zod";

import { EditableServerList } from "$lib/api/browse/editable-server-list";
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

const hiddenUsers = new EditableServerList({
	request: () =>
		fetchRest("/v1/hides").then(
			(res) => res.jsonParsed(getHiddenUsersResponseSchema).hides,
		),
	ttlMs: 5_000,
});

export function getHiddenUsers(): Promise<HiddenUsers> {
	return hiddenUsers.entries();
}

export async function getHiddenUserIdsNewestFirst(): Promise<number[]> {
	const idsInUnstableServerOrder = (await getHiddenUsers()).map(
		({ profileId }) => profileId,
	);
	const listedIds = new Set(idsInUnstableServerOrder);
	const hiddenHereNewestFirst = hiddenUsers
		.addedHereNewestFirst()
		.filter((profileId) => listedIds.has(profileId));
	return [
		...new Set([
			...hiddenHereNewestFirst,
			...idsInUnstableServerOrder.toReversed(),
		]),
	];
}

export async function markHiddenProfilesUnviewable(): Promise<void> {
	for (const { profileId } of await getHiddenUsers())
		markProfileUnviewable(profileId);
}

export async function hideUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await hiddenUsers.add({
		profileId,
		request: () =>
			fetchRest(`/v1/me/hides/${profileId}`, { method: "POST" }).then(
				(res) => res.assertOk(),
			),
	});
	markProfileUnviewable(profileId);
}

export async function unhideUser({
	profileId,
}: {
	profileId: Profile["profileId"];
}) {
	await hiddenUsers.remove({
		profileId,
		request: () =>
			fetchRest(`/v1/hides/${profileId}`, { method: "DELETE" }).then(
				(res) => res.assertOk(),
			),
	});
	markProfileViewable(profileId);
}
