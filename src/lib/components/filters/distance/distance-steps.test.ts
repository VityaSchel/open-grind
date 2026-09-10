import { describe, expect, it } from "vitest";

import {
	closestMaxDistanceStep,
	DEFAULT_MAX_DISTANCE_STEP,
	MAX_DISTANCE_STEPS,
	maxDistanceLabel,
	maxDistanceMetres,
} from "$lib/components/filters/distance/distance-steps";

function officialAppMilesToMetres(miles: number): number {
	return (miles * 5280) / 3.280839895;
}

const OFFICIAL_APP_TOLERANCE_DIGITS = 5;

describe("MAX_DISTANCE_STEPS", () => {
	it("offers the official app's inbox distance options", () => {
		expect(MAX_DISTANCE_STEPS).toEqual([0.5, 1, 2, 3, 5, 10, 20, 30, 50]);
	});

	it("ascends without repeats so a slider index maps to one step", () => {
		const ascending = [...MAX_DISTANCE_STEPS].sort((a, b) => a - b);
		expect(MAX_DISTANCE_STEPS).toEqual(ascending);
		expect(new Set(MAX_DISTANCE_STEPS).size).toBe(
			MAX_DISTANCE_STEPS.length,
		);
	});

	it("defaults to a step the slider can find", () => {
		expect(MAX_DISTANCE_STEPS).toContain(DEFAULT_MAX_DISTANCE_STEP);
		expect(DEFAULT_MAX_DISTANCE_STEP).toBe(10);
	});
});

describe("maxDistanceMetres", () => {
	it("reads metric steps as kilometres", () => {
		const metres = MAX_DISTANCE_STEPS.map((step) =>
			maxDistanceMetres({ step, units: "metric" }),
		);
		expect(metres).toEqual([
			500, 1000, 2000, 3000, 5000, 10000, 20000, 30000, 50000,
		]);
	});

	it("reads imperial steps as miles", () => {
		expect(maxDistanceMetres({ step: 5, units: "imperial" })).toBeCloseTo(
			8046.72,
			OFFICIAL_APP_TOLERANCE_DIGITS,
		);
		expect(maxDistanceMetres({ step: 0.5, units: "imperial" })).toBeCloseTo(
			804.672,
			OFFICIAL_APP_TOLERANCE_DIGITS,
		);
		expect(maxDistanceMetres({ step: 50, units: "imperial" })).toBeCloseTo(
			80467.2,
			OFFICIAL_APP_TOLERANCE_DIGITS,
		);
	});

	it("agrees with the official app's mile conversion on every step", () => {
		for (const step of MAX_DISTANCE_STEPS) {
			expect(
				maxDistanceMetres({ step, units: "imperial" }),
				`${step} mi`,
			).toBeCloseTo(
				officialAppMilesToMetres(step),
				OFFICIAL_APP_TOLERANCE_DIGITS,
			);
		}
	});

	it("sends a larger radius for a mile than for a kilometre", () => {
		for (const step of MAX_DISTANCE_STEPS) {
			expect(
				maxDistanceMetres({ step, units: "imperial" }),
				`${step}`,
			).toBeGreaterThan(maxDistanceMetres({ step, units: "metric" }));
		}
	});
});

describe("closestMaxDistanceStep", () => {
	it("round-trips every metric step", () => {
		for (const step of MAX_DISTANCE_STEPS) {
			const metres = maxDistanceMetres({ step, units: "metric" });
			expect(
				closestMaxDistanceStep({ metres, units: "metric" }),
				`${step} km -> ${metres} m`,
			).toBe(step);
		}
	});

	it("round-trips every imperial step", () => {
		for (const step of MAX_DISTANCE_STEPS) {
			const metres = maxDistanceMetres({ step, units: "imperial" });
			expect(
				closestMaxDistanceStep({ metres, units: "imperial" }),
				`${step} mi -> ${metres} m`,
			).toBe(step);
		}
	});

	it("snaps an off-ladder distance to the nearest step", () => {
		expect(closestMaxDistanceStep({ metres: 3800, units: "metric" })).toBe(
			3,
		);
		expect(closestMaxDistanceStep({ metres: 4400, units: "metric" })).toBe(
			5,
		);
		expect(
			closestMaxDistanceStep({ metres: 20000, units: "imperial" }),
		).toBe(10);
	});

	it("clamps to the ladder's ends", () => {
		expect(closestMaxDistanceStep({ metres: 100, units: "metric" })).toBe(
			0.5,
		);
		expect(closestMaxDistanceStep({ metres: 0, units: "metric" })).toBe(
			0.5,
		);
		expect(closestMaxDistanceStep({ metres: 400, units: "imperial" })).toBe(
			0.5,
		);
		expect(
			closestMaxDistanceStep({ metres: 999999, units: "metric" }),
		).toBe(50);
		expect(
			closestMaxDistanceStep({ metres: 999999, units: "imperial" }),
		).toBe(50);
	});

	it("snaps metres stored under the other unit system", () => {
		const fiveMiles = maxDistanceMetres({ step: 5, units: "imperial" });
		expect(
			closestMaxDistanceStep({ metres: fiveMiles, units: "metric" }),
		).toBe(10);

		const fiveKilometres = maxDistanceMetres({ step: 5, units: "metric" });
		expect(
			closestMaxDistanceStep({
				metres: fiveKilometres,
				units: "imperial",
			}),
		).toBe(3);

		const fiftyKilometres = maxDistanceMetres({
			step: 50,
			units: "metric",
		});
		expect(
			closestMaxDistanceStep({
				metres: fiftyKilometres,
				units: "imperial",
			}),
		).toBe(30);
	});
});

describe("maxDistanceLabel", () => {
	it("names the unit the step is measured in", () => {
		expect(maxDistanceLabel({ step: 5, units: "metric" })).toBe(
			"Within 5 km",
		);
		expect(maxDistanceLabel({ step: 5, units: "imperial" })).toBe(
			"Within 5 mi",
		);
	});

	it("keeps the fractional first step readable", () => {
		expect(maxDistanceLabel({ step: 0.5, units: "metric" })).toBe(
			"Within 0.5 km",
		);
		expect(maxDistanceLabel({ step: 0.5, units: "imperial" })).toBe(
			"Within 0.5 mi",
		);
	});

	it("gives every step a distinct label", () => {
		expect(
			MAX_DISTANCE_STEPS.map((step) =>
				maxDistanceLabel({ step, units: "metric" }),
			),
		).toEqual([
			"Within 0.5 km",
			"Within 1 km",
			"Within 2 km",
			"Within 3 km",
			"Within 5 km",
			"Within 10 km",
			"Within 20 km",
			"Within 30 km",
			"Within 50 km",
		]);
	});
});
