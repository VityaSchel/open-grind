import { describe, expect, it } from "vitest";

import {
	coarsenGeohash,
	decodeGeohash,
	geohashSchema,
} from "$lib/model/geohash";
import { HONDURAS_INLAND_BOXES, randomHondurasGeohash } from "./honduras";

const HONDURAS_INSET_OUTLINE: { lat: number; lon: number }[] = [
	{ lat: 13.1, lon: -87.204 },
	{ lat: 13.1, lon: -87.044 },
	{ lat: 13.32, lon: -87.004 },
	{ lat: 13.4, lon: -86.844 },
	{ lat: 13.84, lon: -86.844 },
	{ lat: 13.88, lon: -86.384 },
	{ lat: 14.16, lon: -86.124 },
	{ lat: 14.16, lon: -85.964 },
	{ lat: 14.02, lon: -85.884 },
	{ lat: 14.1, lon: -85.664 },
	{ lat: 14.4, lon: -85.324 },
	{ lat: 14.64, lon: -85.244 },
	{ lat: 14.92, lon: -84.964 },
	{ lat: 14.94, lon: -84.784 },
	{ lat: 14.78, lon: -84.644 },
	{ lat: 14.76, lon: -84.464 },
	{ lat: 14.9, lon: -84.164 },
	{ lat: 14.9, lon: -83.884 },
	{ lat: 15.06, lon: -83.624 },
	{ lat: 15.26, lon: -84.144 },
	{ lat: 15.5, lon: -84.324 },
	{ lat: 15.66, lon: -84.264 },
	{ lat: 15.72, lon: -84.344 },
	{ lat: 15.66, lon: -84.684 },
	{ lat: 15.8, lon: -84.784 },
	{ lat: 15.88, lon: -84.984 },
	{ lat: 15.78, lon: -85.204 },
	{ lat: 15.76, lon: -85.544 },
	{ lat: 15.9, lon: -85.824 },
	{ lat: 15.66, lon: -86.324 },
	{ lat: 15.66, lon: -87.024 },
	{ lat: 15.74, lon: -87.304 },
	{ lat: 15.68, lon: -87.524 },
	{ lat: 15.8, lon: -87.784 },
	{ lat: 15.58, lon: -88.084 },
	{ lat: 15.58, lon: -88.244 },
	{ lat: 15.04, lon: -88.904 },
	{ lat: 15.0, lon: -89.064 },
	{ lat: 14.84, lon: -89.104 },
	{ lat: 14.66, lon: -89.024 },
	{ lat: 14.5, lon: -89.084 },
	{ lat: 14.3, lon: -88.904 },
	{ lat: 14.0, lon: -88.384 },
	{ lat: 14.1, lon: -88.284 },
	{ lat: 14.1, lon: -88.064 },
	{ lat: 14.0, lon: -87.984 },
	{ lat: 14.02, lon: -87.764 },
	{ lat: 13.84, lon: -87.584 },
	{ lat: 13.58, lon: -87.644 },
	{ lat: 13.46, lon: -87.284 },
	{ lat: 13.34, lon: -87.264 },
	{ lat: 13.24, lon: -87.344 },
];

function isInsideHonduras({ lat, lon }: { lat: number; lon: number }): boolean {
	let inside = false;
	for (
		let i = 0, j = HONDURAS_INSET_OUTLINE.length - 1;
		i < HONDURAS_INSET_OUTLINE.length;
		j = i++
	) {
		const { lat: latI, lon: lonI } = HONDURAS_INSET_OUTLINE[i]!;
		const { lat: latJ, lon: lonJ } = HONDURAS_INSET_OUTLINE[j]!;
		const straddles = latI > lat !== latJ > lat;
		if (
			straddles &&
			lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI
		) {
			inside = !inside;
		}
	}
	return inside;
}

const samples = Array.from({ length: 2000 }, randomHondurasGeohash);

describe("randomHondurasGeohash", () => {
	it("places every location inside Honduras", () => {
		const outside = samples
			.map(decodeGeohash)
			.filter((position) => !isInsideHonduras(position));

		expect(outside).toEqual([]);
	});

	it("keeps every corner of every box inside Honduras", () => {
		const corners = HONDURAS_INLAND_BOXES.flatMap(
			({ south, north, west, east }) =>
				[south, north].flatMap((lat) =>
					[west, east].map((lon) => ({ lat, lon })),
				),
		);

		expect(corners.filter((corner) => !isInsideHonduras(corner))).toEqual(
			[],
		);
	});

	it("produces full precision geohashes", () => {
		const malformed = samples.filter(
			(hash) => !geohashSchema.safeParse(hash).success,
		);

		expect(malformed).toEqual([]);
	});

	it("lands on the same coarse grid the cascade reports", () => {
		const offGrid = samples.filter((hash) => coarsenGeohash(hash) !== hash);

		expect(offGrid).toEqual([]);
	});

	it("draws from every inland box", () => {
		const used = new Set(
			samples
				.map(decodeGeohash)
				.map(({ lat, lon }) =>
					HONDURAS_INLAND_BOXES.findIndex(
						({ south, north, west, east }) =>
							lat >= south &&
							lat <= north &&
							lon >= west &&
							lon <= east,
					),
				),
		);

		expect(
			HONDURAS_INLAND_BOXES.map((_, index) => used.has(index)),
		).toEqual(HONDURAS_INLAND_BOXES.map(() => true));
	});

	it("spreads locations rather than reusing one point", () => {
		expect(new Set(samples).size).toBeGreaterThan(samples.length - 20);

		const latitudes = samples.map((hash) => decodeGeohash(hash).lat);
		expect(Math.max(...latitudes) - Math.min(...latitudes)).toBeGreaterThan(
			1,
		);
	});
});
