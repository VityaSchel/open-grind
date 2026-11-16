import type { TileLayerOptions } from "leaflet";

export const PIN_ZOOM = 17;

export const ACCURACY_CIRCLE_COLOR = "#3b82f6";

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

export const OSM_MAX_ZOOM = 19;

export const OSM_TILE_OPTIONS: TileLayerOptions = {
	maxZoom: OSM_MAX_ZOOM,
	referrerPolicy: "strict-origin-when-cross-origin",
	// do not enable: https://github.com/Leaflet/Leaflet/issues/6195
	// detectRetina: true,
};
