import { approximateRadiusMeters } from "./post-form";

const EQUATOR_METERS = 40_075_016.686;
const TILE_PIXELS = 256;
const MAX_TILE_ZOOM = 19;

export type AccuracyMapView = { zoom: number; scale: number };

export function accuracyMapView({
	locationRadius,
	latitude,
	circleDiameterPx,
}: {
	locationRadius: number;
	latitude: number;
	circleDiameterPx: number;
}): AccuracyMapView {
	const metersPerPixel =
		(2 * approximateRadiusMeters({ locationRadius })) / circleDiameterPx;
	const exactZoom = Math.log2(
		(EQUATOR_METERS * Math.cos((latitude * Math.PI) / 180)) /
			(TILE_PIXELS * metersPerPixel),
	);
	const zoom = Math.min(MAX_TILE_ZOOM, Math.max(0, Math.ceil(exactZoom)));
	return { zoom, scale: 2 ** (exactZoom - zoom) };
}
