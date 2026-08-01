import type z from "zod";

import { fetchRest } from "$lib/api";
import { registerAccountCache } from "$lib/api/account-caches";
import { profileTagsResponseSchema } from "$lib/model/users/tags";

let cachedTags: z.infer<typeof profileTagsResponseSchema> | null = null;

registerAccountCache({ reset: () => (cachedTags = null) });

export async function getTags() {
	if (cachedTags) return cachedTags;
	const tags = await fetchRest("/v1/tags").then((res) =>
		res.jsonParsed(profileTagsResponseSchema),
	);
	cachedTags = tags;
	return tags;
}
