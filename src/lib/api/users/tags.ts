import { cachedFetch } from "#lib/api/cache.ts";
import { fetchRest } from "#lib/api/transport.ts";
import { profileTagsResponseSchema } from "#lib/model/users/tags.ts";

export const getTags = cachedFetch(() =>
	fetchRest("/v1/tags").then((res) =>
		res.jsonParsed(profileTagsResponseSchema),
	),
);
