import z from "zod";

import { fetchRest } from "$lib/api";
import {
	viewerProfileSchema,
	viewPreviewSchema,
} from "$lib/model/interest/views";

const viewsListResponseSchema = z.object({
	profiles: z.array(viewerProfileSchema),
	previews: z.array(viewPreviewSchema),
});

export async function getViews() {
	return await fetchRest("/v7/views/list").then((res) =>
		res.jsonParsed(viewsListResponseSchema),
	);
}

export async function recordProfileView({ profileId }: { profileId: number }) {
	return await fetchRest("/v4/views", {
		method: "POST",
		body: {
			viewedProfileIds: [String(profileId)],
			foundVia: null,
		},
	});
}
