import z from "zod";

import { fetchRest } from "$lib/api";

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

export async function getPlaces({ query }: { query: string }) {
	const response = await fetchRest(
		"/v3/places/search?" +
			new URLSearchParams({
				placeName: query,
			}).toString(),
	).then((res) => res.jsonParsed(placesResponseSchema));
	return response;
}
