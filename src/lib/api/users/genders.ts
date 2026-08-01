import { fetchRest } from "$lib/api";
import { cachedFetch } from "$lib/api/cache";
import { gendersSchema } from "$lib/model/users/genders";

export const getGenders = cachedFetch(() =>
	fetchRest("/public/v2/genders").then((res) => res.jsonParsed(gendersSchema)),
);
