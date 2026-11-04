import { cachedFetch } from "#lib/api/cache.ts";
import { fetchRest } from "#lib/api/transport.ts";
import { pronounsSchema } from "#lib/model/users/pronouns.ts";

export const getPronouns = cachedFetch(() =>
	fetchRest("/v1/pronouns").then((res) => res.jsonParsed(pronounsSchema)),
);
