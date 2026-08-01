import type z from "zod";

import { fetchRest } from "$lib/api";
import { registerAccountCache } from "$lib/api/account-caches";
import { pronounsSchema } from "$lib/model/users/pronouns";

let cachedPronouns: z.infer<typeof pronounsSchema> | null = null;

registerAccountCache({ reset: () => (cachedPronouns = null) });

export async function getPronouns() {
	if (cachedPronouns) return cachedPronouns;
	const pronouns = await fetchRest("/v1/pronouns").then((res) =>
		res.jsonParsed(pronounsSchema),
	);
	cachedPronouns = pronouns;
	return pronouns;
}
