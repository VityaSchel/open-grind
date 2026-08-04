import { cachedFetch } from "$lib/api/cache";
import { fetchRest } from "$lib/api/transport";
import { pronounsSchema } from "$lib/model/users/pronouns";

export const getPronouns = cachedFetch(() =>
	fetchRest("/v1/pronouns").then((res) => res.jsonParsed(pronounsSchema)),
);
