import { coarsenGeohash, encodeGeohash } from "$lib/model/geohash";

type Box = { south: number; north: number; west: number; east: number };

export const HONDURAS_INLAND_BOXES = [
	{ south: 14.24, north: 15.49, west: -88.22, east: -85.61 },
	{ south: 15.0, north: 15.59, west: -85.6, east: -84.41 },
	{ south: 14.3, north: 15.09, west: -88.74, east: -88.23 },
	{ south: 13.62, north: 14.23, west: -87.52, east: -86.97 },
] as const satisfies readonly Box[];

const boxArea = ({ south, north, west, east }: Box) =>
	(north - south) * (east - west);

const totalArea = HONDURAS_INLAND_BOXES.reduce(
	(sum, box) => sum + boxArea(box),
	0,
);

function randomBoxByArea(): Box {
	let remainingArea = Math.random() * totalArea;
	for (const box of HONDURAS_INLAND_BOXES) {
		remainingArea -= boxArea(box);
		if (remainingArea <= 0) return box;
	}
	return HONDURAS_INLAND_BOXES[0];
}

export function randomHondurasGeohash(): string {
	const { south, north, west, east } = randomBoxByArea();
	return coarsenGeohash(
		encodeGeohash({
			lat: south + Math.random() * (north - south),
			lon: west + Math.random() * (east - west),
		}),
	);
}
