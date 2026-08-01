import { fetchRest } from "$lib/api";
import { cachedFetch } from "$lib/api/cache";
import { profileTagsResponseSchema } from "$lib/model/users/tags";

export const getTags = cachedFetch(() =>
	fetchRest("/v1/tags").then((res) =>
		res.jsonParsed(profileTagsResponseSchema),
	),
);
