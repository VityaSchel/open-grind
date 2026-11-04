import type { TileLayerOptions } from "leaflet";

export const PIN_ZOOM = 17;

export const ACCURACY_CIRCLE_COLOR = "#3b82f6";

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const OSM_TILE_OPTIONS: TileLayerOptions = {
	maxZoom: 19,
	referrerPolicy: "strict-origin-when-cross-origin",
	attribution:
		'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer nofollow noopener">OpenStreetMap contributors</a> &nbsp;',
	// do not enable: https://github.com/Leaflet/Leaflet/issues/6195
	// detectRetina: true,
};
