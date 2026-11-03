import type z from "zod";

import { fetchRest } from "#lib/api/transport.ts";
import { cascadeV4QuerySchema } from "#lib/model/browse/grid/cascade/query/v4.ts";
import { cascadeV4ResponseSchema } from "#lib/model/browse/grid/cascade/response/v4.ts";
import {
	searchProfilesResponseSchema,
	searchQuerySchema,
} from "#lib/model/browse/grid/search.ts";
import { coarsenGeohash } from "#lib/model/geohash.ts";
import { markOnlineRefreshed } from "#lib/presence/online-clock.ts";
import { urlSearchParamsCodec } from "#lib/util/url-search-params.ts";

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
