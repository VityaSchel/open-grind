import z from "zod";

import { fetchRest } from "$lib/api";
import { cascadeV3QuerySchema } from "$lib/model/browse/grid/cascade/query/v3";
import { cascadeV4QuerySchema } from "$lib/model/browse/grid/cascade/query/v4";
import { cascadeV3ResponseSchema } from "$lib/model/browse/grid/cascade/response/v3";
import { cascadeV4ResponseSchema } from "$lib/model/browse/grid/cascade/response/v4";
import { searchProfileSchema, searchQuerySchema } from "$lib/model/browse/grid/search";
import { urlSearchParamsCodec } from "$lib/util/utils";

export async function searchProfiles(query: z.infer<typeof searchQuerySchema>) {
	return await fetchRest(
		"/v7/search?" +
			new URLSearchParams(
				urlSearchParamsCodec(searchQuerySchema).encode(query),
			).toString(),
	)
		.then((res) => res.json())
		.then((data) =>
			z
				.object({
					profiles: z.array(searchProfileSchema),
				})
				.parse(data),
		);
}

export async function getCascadeV3(
	query: z.infer<typeof cascadeV3QuerySchema>,
) {
	return await fetchRest(
		"/v3/cascade?" +
			new URLSearchParams(
				urlSearchParamsCodec(cascadeV3QuerySchema).encode(query),
			).toString(),
	).then((res) => res.jsonParsed(cascadeV3ResponseSchema));
}

export async function getCascadeV4(
	query: z.infer<typeof cascadeV4QuerySchema>,
) {
	return await fetchRest(
		"/v4/cascade?" +
			new URLSearchParams(
				urlSearchParamsCodec(cascadeV4QuerySchema).encode(query),
			).toString(),
	).then((res) => res.jsonParsed(cascadeV4ResponseSchema));
}
