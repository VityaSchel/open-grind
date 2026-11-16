import { describe, expect, it } from "vitest";

import { accuracyMapView } from "./accuracy-map";
import { approximateRadiusMeters } from "./post-form";

const MADRID_LATITUDE = 40.42;
const CIRCLE = 96;

function metersPerPixelOf({
	zoom,
	scale,
	latitude,
}: {
	zoom: number;
	scale: number;
	latitude: number;
}) {
	return (
		(40_075_016.686 * Math.cos((latitude * Math.PI) / 180)) /
		(256 * 2 ** zoom * scale)
	);
}

describe("accuracyMapView", () => {
	it("draws every radius at the circle's size, so the circle never changes on screen", () => {
		for (let locationRadius = 0; locationRadius <= 100; locationRadius++) {
			const view = accuracyMapView({
				locationRadius,
				latitude: MADRID_LATITUDE,
				circleDiameterPx: CIRCLE,
			});

			expect(
				metersPerPixelOf({ ...view, latitude: MADRID_LATITUDE }) *
					CIRCLE,
			).toBeCloseTo(2 * approximateRadiusMeters({ locationRadius }), 6);
		}
	});

	it("only ever shrinks whole-level tiles, never stretches them", () => {
		for (let locationRadius = 0; locationRadius <= 100; locationRadius++) {
			const { zoom, scale } = accuracyMapView({
				locationRadius,
				latitude: MADRID_LATITUDE,
				circleDiameterPx: CIRCLE,
			});

			expect(Number.isInteger(zoom)).toBe(true);
			expect(scale).toBeGreaterThan(0.5);
			expect(scale).toBeLessThanOrEqual(1);
		}
	});

	it("loads a handful of tile levels across the whole slider", () => {
		const zooms = new Set(
			Array.from(
				{ length: 101 },
				(_, locationRadius) =>
					accuracyMapView({
						locationRadius,
						latitude: MADRID_LATITUDE,
						circleDiameterPx: CIRCLE,
					}).zoom,
			),
		);

		expect([...zooms]).toEqual([16, 15, 14, 13, 12]);
	});
});
