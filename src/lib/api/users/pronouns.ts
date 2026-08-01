import { fetchRest } from "$lib/api";
import { cachedFetch } from "$lib/api/cache";
import { pronounsSchema } from "$lib/model/users/pronouns";

export const getPronouns = cachedFetch(() =>
	fetchRest("/v1/pronouns").then((res) => res.jsonParsed(pronounsSchema)),
);
