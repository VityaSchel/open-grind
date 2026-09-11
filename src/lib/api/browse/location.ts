import z from "zod";

import { fetchRest } from "$lib/api/transport";
import { coarsenGeohash } from "$lib/model/geohash";

const placesResponseSchema = z.object({
	places: z.array(
		z.object({
			name: z.string(),
			address: z.string().nullable(),
			lat: z.number(),
			lon: z.number(),
			importance: z.number(),
		}),
	),
});

export async function updateLocation({ geohash }: { geohash: string }) {
	return await fetchRest("/v4/location", {
		method: "PUT",
		body: { geohash: coarsenGeohash(geohash) },
	}).then((res) => res.assertOk());
}

export async function getPlaces({ query }: { query: string }) {
	const response = await fetchRest(
		"/v3/places/search?" +
			new URLSearchParams({ placeName: query }).toString(),
	).then((res) => res.jsonParsed(placesResponseSchema));
	return response;
}
