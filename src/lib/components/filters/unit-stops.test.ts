import { describe, expect, it } from "vitest";

import {
	HEIGHT_CM_MAX,
	HEIGHT_CM_MIN,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";
import { formatHeight, formatWeightKg } from "$lib/util/units";
import {
	HEIGHT_STOPS,
	storedAfterMove,
	type UnitStops,
	WEIGHT_STOPS,
} from "./unit-stops";

const everyStop = ({ first, last }: UnitStops) =>
	Array.from({ length: last - first + 1 }, (_, offset) => first + offset);

const wholeAmounts = ({ floor, ceiling }: { floor: number; ceiling: number }) =>
	Array.from({ length: ceiling - floor + 1 }, (_, offset) => floor + offset);

describe.each([
	{
		name: "height in inches",
		stops: HEIGHT_STOPS.imperial,
		floor: HEIGHT_CM_MIN,
		ceiling: HEIGHT_CM_MAX,
		format: formatHeight,
		ends: [48, 95],
	},
	{
		name: "weight in pounds",
		stops: WEIGHT_STOPS.imperial,
		floor: WEIGHT_KG_MIN,
		ceiling: WEIGHT_KG_MAX,
		format: formatWeightKg,
		ends: [90, 600],
	},
])("$name", ({ stops, floor, ceiling, format, ends }) => {
	it("runs between the stops nearest the metric limits", () => {
		expect([stops.first, stops.last]).toEqual(ends);
	});

	it("shows a stop's stored amount back at that stop", () => {
		for (const stop of everyStop(stops))
			expect(stops.toStop(stops.toStored(stop))).toBe(stop);
	});

	it("labels every stop differently", () => {
		const labels = everyStop(stops).map((stop) =>
			format(stops.toStored(stop), "imperial"),
		);

		expect(new Set(labels).size).toBe(labels.length);
	});

	it("stores the metric limits at its ends, which read as no bound", () => {
		expect(stops.toStored(stops.first)).toBe(floor);
		expect(stops.toStored(stops.last)).toBe(ceiling);
	});

	it("stores nothing outside the metric limits", () => {
		for (const stop of everyStop(stops)) {
			expect(stops.toStored(stop)).toBeGreaterThanOrEqual(floor);
			expect(stops.toStored(stop)).toBeLessThanOrEqual(ceiling);
		}
	});

	it("puts every stored metric amount on a stop", () => {
		for (const amount of wholeAmounts({ floor, ceiling })) {
			expect(stops.toStop(amount)).toBeGreaterThanOrEqual(stops.first);
			expect(stops.toStop(amount)).toBeLessThanOrEqual(stops.last);
		}
	});
});

describe.each([
	{
		name: "height in centimetres",
		stops: HEIGHT_STOPS.metric,
		floor: HEIGHT_CM_MIN,
		ceiling: HEIGHT_CM_MAX,
	},
	{
		name: "weight in kilograms",
		stops: WEIGHT_STOPS.metric,
		floor: WEIGHT_KG_MIN,
		ceiling: WEIGHT_KG_MAX,
	},
])("$name", ({ stops, floor, ceiling }) => {
	it("stops on every whole metric amount and stores it unchanged", () => {
		expect([stops.first, stops.last]).toEqual([floor, ceiling]);
		for (const amount of wholeAmounts({ floor, ceiling })) {
			expect(stops.toStop(amount)).toBe(amount);
			expect(stops.toStored(amount)).toBe(amount);
		}
	});
});

describe("weight in kilograms", () => {
	it("shows a weight picked in pounds at its nearest kilogram", () => {
		expect(WEIGHT_STOPS.metric.toStop(79.8)).toBe(80);
	});
});

describe("a bound stored just inside a limit", () => {
	it("stays off the end stops, which only the limits reach", () => {
		expect(HEIGHT_STOPS.imperial.toStop(122)).toBe(49);
		expect(HEIGHT_STOPS.imperial.toStop(123)).toBe(49);
		expect(WEIGHT_STOPS.metric.toStop(41.3)).toBe(42);
		expect(WEIGHT_STOPS.metric.toStop(271.7)).toBe(271);
	});

	it("is dropped once its thumb moves to the end of the track", () => {
		expect(
			storedAfterMove({
				stops: HEIGHT_STOPS.imperial,
				stored: [122, HEIGHT_CM_MAX],
				moved: [48, 95],
			}),
		).toEqual([HEIGHT_CM_MIN, HEIGHT_CM_MAX]);
		expect(
			storedAfterMove({
				stops: WEIGHT_STOPS.metric,
				stored: [41.3, 271.7],
				moved: [41, 272],
			}),
		).toEqual([WEIGHT_KG_MIN, WEIGHT_KG_MAX]);
	});
});

describe("storedAfterMove", () => {
	const stops = HEIGHT_STOPS.imperial;

	it("stores the moved thumb's stop and keeps the other amount as it was", () => {
		expect(
			storedAfterMove({ stops, stored: [170, 176], moved: [66, 69] }),
		).toEqual([168, 176]);
		expect(
			storedAfterMove({ stops, stored: [170, 176], moved: [67, 70] }),
		).toEqual([170, 178]);
	});

	it("changes nothing when no thumb left its stop", () => {
		expect(
			storedAfterMove({ stops, stored: [171, 176], moved: [67, 69] }),
		).toEqual([171, 176]);
	});

	it("keeps the amount of a thumb another one was dragged past", () => {
		expect(
			storedAfterMove({ stops, stored: [170, 176], moved: [69, 72] }),
		).toEqual([176, 183]);
		expect(
			storedAfterMove({ stops, stored: [171, 181], moved: [60, 67] }),
		).toEqual([152, 171]);
	});

	it("keeps two amounts that share a stop apart", () => {
		expect(
			storedAfterMove({ stops, stored: [174, 176], moved: [68, 69] }),
		).toEqual([173, 176]);
		expect(
			storedAfterMove({ stops, stored: [174, 176], moved: [69, 70] }),
		).toEqual([174, 178]);
	});
});
