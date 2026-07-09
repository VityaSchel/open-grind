import z from "zod";

export const unitSystemSchema = z.enum(["metric", "imperial"]);

export type UnitSystem = z.infer<typeof unitSystemSchema>;

const FEET_PER_METRE = 3.28084;
const METRES_PER_MILE = 1609.344;
const INCHES_PER_CM = 0.3937007874;
const POUNDS_PER_KG = 2.2046226218;

export function formatDistance(
	distanceMetres: number,
	units: UnitSystem,
): string {
	if (units === "imperial") {
		if (distanceMetres < METRES_PER_MILE) {
			return `${Math.round(distanceMetres * FEET_PER_METRE)} ft`;
		}
		return `${(distanceMetres / METRES_PER_MILE).toFixed(1)} mi`;
	}

	if (distanceMetres < 1000) {
		return `${Math.round(distanceMetres)} m`;
	}
	return `${(distanceMetres / 1000).toFixed(1)} km`;
}

export function formatHeight(heightCm: number, units: UnitSystem): string {
	if (units === "imperial") {
		const totalInches = Math.round(heightCm * INCHES_PER_CM);
		const feet = Math.floor(totalInches / 12);
		const inches = totalInches % 12;
		return `${feet}'${inches}"`;
	}

	return `${Math.round(heightCm)} cm`;
}

export function formatWeightKg(weightKg: number, units: UnitSystem): string {
	if (units === "imperial") {
		return `${Math.round(weightKg * POUNDS_PER_KG)} lb`;
	}

	return `${Math.round(weightKg)} kg`;
}

export function formatWeightGrams(
	weightGrams: number,
	units: UnitSystem,
): string {
	return formatWeightKg(weightGrams / 1000, units);
}
