import type z from "zod";

import { fetchRest } from "$lib/api";
import { pronounsSchema } from "$lib/model/users/pronouns";

let cachedPronouns: z.infer<typeof pronounsSchema> | null = null;
export async function fetchPronouns() {
	if (cachedPronouns) return cachedPronouns;
	const pronouns = await fetchRest("/v1/pronouns").then((res) =>
		res.jsonParsed(pronounsSchema),
	);
	cachedPronouns = pronouns;
	return pronouns;
}
