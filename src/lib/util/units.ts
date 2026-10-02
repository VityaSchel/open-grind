import z from "zod";

export const unitSystemSchema = z.enum(["metric", "imperial"]);

export type UnitSystem = z.infer<typeof unitSystemSchema>;

const FEET_PER_METRE = 3.28084;
export const METRES_PER_MILE = 1609.344;
export const METRES_PER_KILOMETRE = 1000;
const INCHES_PER_CM = 0.3937007874;
const INCHES_PER_FOOT = 12;
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

	if (distanceMetres < METRES_PER_KILOMETRE) {
		return `${Math.round(distanceMetres)} m`;
	}
	return `${(distanceMetres / METRES_PER_KILOMETRE).toFixed(1)} km`;
}

export function cmToInches(cm: number): number {
	return Math.round(cm * INCHES_PER_CM);
}

export function inchesToCm(inches: number): number {
	return Math.round(inches / INCHES_PER_CM);
}

export function formatFeetInches(totalInches: number): string {
	const feet = Math.floor(totalInches / INCHES_PER_FOOT);
	const inches = totalInches % INCHES_PER_FOOT;
	return `${feet}'${inches}"`;
}

export function formatHeight(heightCm: number, units: UnitSystem): string {
	if (units === "imperial") {
		return formatFeetInches(cmToInches(heightCm));
	}

	return `${Math.round(heightCm)} cm`;
}

export function kgToPounds(kg: number): number {
	return Math.round(kg * POUNDS_PER_KG);
}

export function poundsToKg(pounds: number): number {
	return Math.round((pounds / POUNDS_PER_KG) * 10) / 10;
}

export function formatWeightKg(weightKg: number, units: UnitSystem): string {
	if (units === "imperial") {
		return `${kgToPounds(weightKg)} lb`;
	}

	return `${Math.round(weightKg)} kg`;
}

export function formatWeightGrams(
	weightGrams: number,
	units: UnitSystem,
): string {
	return formatWeightKg(weightGrams / 1000, units);
}
