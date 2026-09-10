import {
	METRES_PER_KILOMETRE,
	METRES_PER_MILE,
	type UnitSystem,
} from "$lib/util/units";

export const MAX_DISTANCE_STEPS = [0.5, 1, 2, 3, 5, 10, 20, 30, 50];
export const DEFAULT_MAX_DISTANCE_STEP = 10;

function metresPerStep(units: UnitSystem): number {
	return units === "imperial" ? METRES_PER_MILE : METRES_PER_KILOMETRE;
}

export function maxDistanceMetres({
	step,
	units,
}: {
	step: number;
	units: UnitSystem;
}): number {
	return step * metresPerStep(units);
}

export function closestMaxDistanceStep({
	metres,
	units,
}: {
	metres: number;
	units: UnitSystem;
}): number {
	const distance = metres / metresPerStep(units);
	return MAX_DISTANCE_STEPS.reduce((closest, step) =>
		Math.abs(step - distance) < Math.abs(closest - distance)
			? step
			: closest,
	);
}

export function maxDistanceLabel({
	step,
	units,
}: {
	step: number;
	units: UnitSystem;
}): string {
	return `Within ${step} ${units === "imperial" ? "mi" : "km"}`;
}
