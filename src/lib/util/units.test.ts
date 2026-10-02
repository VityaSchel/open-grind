import { describe, expect, it } from "vitest";

import {
	cmToInches,
	formatDistance,
	formatFeetInches,
	formatHeight,
	formatWeightGrams,
	formatWeightKg,
	inchesToCm,
	kgToPounds,
	poundsToKg,
} from "./units";

const wholeNumbers = ({ from, to }: { from: number; to: number }) =>
	Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe("formatDistance", () => {
	it("switches from metres to kilometres at one kilometre", () => {
		expect(formatDistance(999, "metric")).toBe("999 m");
		expect(formatDistance(1200, "metric")).toBe("1.2 km");
	});

	it("switches from feet to miles at one mile", () => {
		expect(formatDistance(1200, "imperial")).toBe("3937 ft");
		expect(formatDistance(2400, "imperial")).toBe("1.5 mi");
	});
});

describe("formatHeight", () => {
	it("shows whole centimetres or feet and inches", () => {
		expect(formatHeight(180, "metric")).toBe("180 cm");
		expect(formatHeight(180, "imperial")).toBe("5'11\"");
		expect(formatHeight(183, "imperial")).toBe("6'0\"");
	});
});

describe("formatWeightKg and formatWeightGrams", () => {
	it("show whole kilograms or whole pounds", () => {
		expect(formatWeightKg(79.8, "metric")).toBe("80 kg");
		expect(formatWeightKg(80, "imperial")).toBe("176 lb");
		expect(formatWeightGrams(75_000, "metric")).toBe("75 kg");
		expect(formatWeightGrams(75_000, "imperial")).toBe("165 lb");
	});
});

describe("formatFeetInches", () => {
	it("splits whole inches into feet and the inches left over", () => {
		expect(formatFeetInches(47)).toBe("3'11\"");
		expect(formatFeetInches(72)).toBe("6'0\"");
		expect(formatFeetInches(98)).toBe("8'2\"");
	});
});

describe("height conversion", () => {
	it("rounds to whole inches and whole centimetres", () => {
		expect(cmToInches(180)).toBe(71);
		expect(inchesToCm(71)).toBe(180);
		expect(inchesToCm(72)).toBe(183);
	});

	it("gives back every whole inch it was given", () => {
		for (const inches of wholeNumbers({ from: 36, to: 108 })) {
			expect(cmToInches(inchesToCm(inches))).toBe(inches);
		}
	});
});

describe("weight conversion", () => {
	it("rounds to whole pounds and to a tenth of a kilogram", () => {
		expect(kgToPounds(80)).toBe(176);
		expect(poundsToKg(176)).toBe(79.8);
		expect(poundsToKg(180)).toBe(81.6);
	});

	it("gives back every whole pound it was given", () => {
		for (const pounds of wholeNumbers({ from: 1, to: 700 })) {
			expect(kgToPounds(poundsToKg(pounds))).toBe(pounds);
		}
	});
});
