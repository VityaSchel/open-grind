import { cachedFetch } from "$lib/api/cache";
import { fetchRest } from "$lib/api/transport";
import { profileTagsResponseSchema } from "$lib/model/users/tags";

export const getTags = cachedFetch(() =>
	fetchRest("/v1/tags").then((res) =>
		res.jsonParsed(profileTagsResponseSchema),
	),
);
