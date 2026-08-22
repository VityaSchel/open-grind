import { describe, expect, it } from "vitest";

import { distanceMeters } from "./distance";

const BERLIN = { lat: 52.52, lon: 13.405 };

describe("distanceMeters", () => {
	it("is zero for the same point", () => {
		expect(distanceMeters({ from: BERLIN, to: BERLIN })).toBe(0);
	});

	it("measures a known north-south offset", () => {
		const to = { lat: BERLIN.lat + 1 / 111.32 / 1000, lon: BERLIN.lon };
		expect(distanceMeters({ from: BERLIN, to })).toBeCloseTo(1, 1);
	});

	it("narrows longitude degrees away from the equator", () => {
		const equator = distanceMeters({
			from: { lat: 0, lon: 0 },
			to: { lat: 0, lon: 1 },
		});
		const north = distanceMeters({
			from: { lat: 60, lon: 0 },
			to: { lat: 60, lon: 1 },
		});
		expect(north).toBeLessThan(equator);
		expect(north / equator).toBeCloseTo(0.5, 2);
	});

	it("is symmetric and sign-agnostic", () => {
		const a = { lat: -33.8688, lon: -151.2093 };
		const b = { lat: -33.87, lon: -151.21 };
		expect(distanceMeters({ from: a, to: b })).toBeCloseTo(
			distanceMeters({ from: b, to: a }),
			6,
		);
	});
});
