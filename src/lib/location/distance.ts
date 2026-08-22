import type { Coordinates } from "./location-request.svelte";

const EARTH_RADIUS_METERS = 6_371_000;
const RADIANS_PER_DEGREE = Math.PI / 180;

export function distanceMeters({
	from,
	to,
}: {
	from: Coordinates;
	to: Coordinates;
}): number {
	const meanLat = ((from.lat + to.lat) / 2) * RADIANS_PER_DEGREE;
	const deltaLat = (to.lat - from.lat) * RADIANS_PER_DEGREE;
	const deltaLon =
		(to.lon - from.lon) * RADIANS_PER_DEGREE * Math.cos(meanLat);
	return Math.hypot(deltaLat, deltaLon) * EARTH_RADIUS_METERS;
}
