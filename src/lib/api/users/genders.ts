import type z from "zod";

import { fetchRest } from "$lib/api";
import { registerAccountCache } from "$lib/api/account-caches";
import { gendersSchema } from "$lib/model/users/genders";

let cachedGenders: z.infer<typeof gendersSchema> | null = null;

registerAccountCache({ reset: () => (cachedGenders = null) });

export async function getGenders() {
	if (cachedGenders) return cachedGenders;
	const genders = await fetchRest("/public/v2/genders").then((res) =>
		res.jsonParsed(gendersSchema),
	);
	cachedGenders = genders;
	return genders;
}
