import type z from "zod";

import { fetchRest } from "$lib/api/transport";
import { cascadeV4QuerySchema } from "$lib/model/browse/grid/cascade/query/v4";
import { cascadeV4ResponseSchema } from "$lib/model/browse/grid/cascade/response/v4";
import {
	searchProfilesResponseSchema,
	searchQuerySchema,
} from "$lib/model/browse/grid/search";
import { coarsenGeohash } from "$lib/model/geohash";
import { markOnlineRefreshed } from "$lib/presence/online-clock";
import { urlSearchParamsCodec } from "$lib/util/url-search-params";

export async function searchProfiles(query: z.infer<typeof searchQuerySchema>) {
	return await fetchRest(
		"/v7/search?" +
			new URLSearchParams(
				urlSearchParamsCodec(searchQuerySchema).encode(query),
			).toString(),
	).then((res) => res.jsonParsed(searchProfilesResponseSchema));
}

export async function getCascadeV4(
	query: z.infer<typeof cascadeV4QuerySchema>,
) {
	const coarse = {
		...query,
		nearbyGeoHash: coarsenGeohash(query.nearbyGeoHash),
		...(query.exploreGeoHash && {
			exploreGeoHash: coarsenGeohash(query.exploreGeoHash),
		}),
	};
	const response = await fetchRest(
		"/v4/cascade?" +
			new URLSearchParams(
				urlSearchParamsCodec(cascadeV4QuerySchema).encode(coarse),
			).toString(),
	).then((res) => res.jsonParsed(cascadeV4ResponseSchema));
	markOnlineRefreshed();
	return response;
}
