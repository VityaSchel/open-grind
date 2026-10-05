import z from "zod";

import {
	accountEpoch,
	isAccountEpochCurrent,
	registerAccountCache,
} from "$lib/api/account-caches";
import {
	createRecentlyLifted,
	PROPAGATION_MS,
} from "$lib/api/browse/recently-lifted";
import { FetchCache } from "$lib/api/cache";
import { fetchRest } from "$lib/api/transport";
import {
	markProfileUnviewable,
	markProfileViewable,
} from "$lib/api/users/profile-viewability";
import { now } from "$lib/util/clock";
import type { Profile } from "$lib/model/users/profiles";

const getHiddenUsersResponseSchema = z.object({
	hides: z.array(z.object({ profileId: z.coerce.number() })),
});

type HiddenUsers = z.infer<typeof getHiddenUsersResponseSchema>["hides"];

type HiddenUsersSnapshot = { hides: HiddenUsers; requestedAt: number };

const hiddenUsers = new FetchCache<null, HiddenUsersSnapshot>(
	() => {
		const requestedAt = now();
		return fetchRest("/v1/hides").then((res) => ({
			hides: res.jsonParsed(getHiddenUsersResponseSchema).hides,
			requestedAt,
		}));
	},
	{ ttlMs: 5_000 },
);

const recentlyUnhidden = createRecentlyLifted();

const hiddenHereAt = new Map<number, number>();
registerAccountCache({ reset: () => hiddenHereAt.clear() });

export async function getHiddenUsers(): Promise<HiddenUsers> {
	return (await hiddenUsers.fetch(null)).hides;
}

// The server lists hides in no stable order and without timestamps, so only
// the hides made in this session can be ordered by recency.
export async function getHiddenUserIdsNewestFirst(): Promise<number[]> {
	const { hides, requestedAt } = await hiddenUsers.fetch(null);
	const listedIds = hides.map(({ profileId }) => profileId);
	return [
		...new Set([
			...listedHiddenHereNewestFirst({
				listedIds: new Set(listedIds),
				requestedAt,
			}),
			...listedIds.toReversed(),
		]),
	];
}

function listedHiddenHereNewestFirst({
	listedIds,
	requestedAt,
}: {
	listedIds: Set<number>;
	requestedAt: number;
}): number[] {
	const listedHiddenHere: number[] = [];
	for (const [profileId, hiddenAt] of [...hiddenHereAt].toReversed()) {
		if (listedIds.has(profileId)) listedHiddenHere.push(profileId);
		else if (requestedAt - hiddenAt >= PROPAGATION_MS)
			hiddenHereAt.delete(profileId);
	}
	return listedHiddenHere;
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
	const epoch = accountEpoch();
	await fetchRest(`/v1/me/hides/${profileId}`, { method: "POST" }).then(
		(res) => res.assertOk(),
	);
	hiddenUsers.clear();
	if (isAccountEpochCurrent(epoch)) {
		hiddenHereAt.delete(profileId);
		hiddenHereAt.set(profileId, now());
	}
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
	hiddenHereAt.delete(profileId);
	hiddenUsers.update(null, ({ hides, requestedAt }) => ({
		hides: hides.filter((hidden) => hidden.profileId !== profileId),
		requestedAt,
	}));
	markProfileViewable(profileId);
}
