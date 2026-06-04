import z from "zod";

import { fetchRest } from "$lib/api";
import { tapProfileSchema } from "$lib/model/interest/tap-profile";
import { type TapType } from "$lib/model/interest/taps";
import type { Profile } from "$lib/model/profile";

const getReceivedTapsResponseSchema = z.object({
	profiles: z.array(tapProfileSchema),
});

export async function getReceivedTaps() {
	return await fetchRest("/v2/taps/received").then((res) =>
		res.jsonParsed(getReceivedTapsResponseSchema),
	);
}

const sendTapResponseSchema = z.object({
	isMutual: z.boolean(),
});

export async function sendTap({
	recipientId,
	tapType,
}: {
	recipientId: Profile["profileId"];
	tapType: TapType;
}) {
	return await fetchRest("/v2/taps/add", {
		method: "POST",
		body: {
			recipientId,
			tapType,
		},
	}).then((res) => res.jsonParsed(sendTapResponseSchema));
}
