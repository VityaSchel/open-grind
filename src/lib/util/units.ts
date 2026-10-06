import z from "zod";

import { t } from "$lib/i18n";
import { formatNumber, isolate } from "$lib/i18n/format";

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
			return formatNumber({
				value: distanceMetres * FEET_PER_METRE,
				preset: "distanceFeet",
			});
		}
		return formatNumber({
			value: distanceMetres / METRES_PER_MILE,
			preset: "distanceMiles",
		});
	}

	if (distanceMetres < METRES_PER_KILOMETRE) {
		return formatNumber({
			value: distanceMetres,
			preset: "distanceMeters",
		});
	}
	return formatNumber({
		value: distanceMetres / METRES_PER_KILOMETRE,
		preset: "distanceKilometers",
	});
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
	return isolate(
		t("common.units.feetInches", {
			feet: String(feet),
			inches: String(inches),
		}),
	);
}

export function formatHeight(heightCm: number, units: UnitSystem): string {
	if (units === "imperial") {
		return formatFeetInches(cmToInches(heightCm));
	}

	return formatNumber({ value: heightCm, preset: "heightCentimeters" });
}

export function kgToPounds(kg: number): number {
	return Math.round(kg * POUNDS_PER_KG);
}

export function poundsToKg(pounds: number): number {
	return Math.round((pounds / POUNDS_PER_KG) * 10) / 10;
}

export function formatWeightKg(weightKg: number, units: UnitSystem): string {
	if (units === "imperial") {
		return formatNumber({
			value: kgToPounds(weightKg),
			preset: "weightPounds",
		});
	}

	return formatNumber({ value: weightKg, preset: "weightKilograms" });
}

export function formatWeightGrams(
	weightGrams: number,
	units: UnitSystem,
): string {
	return formatWeightKg(weightGrams / 1000, units);
}
