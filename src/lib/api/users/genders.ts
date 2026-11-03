import { cachedFetch } from "#lib/api/cache.ts";
import { fetchRest } from "#lib/api/transport.ts";
import { gendersSchema } from "#lib/model/users/genders.ts";

export const getGenders = cachedFetch(() =>
	fetchRest("/public/v2/genders").then((res) =>
		res.jsonParsed(gendersSchema),
	),
);
