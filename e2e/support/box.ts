import { expect } from "@playwright/test";

export type Box = { x: number; y: number; width: number; height: number };

const TOLERANCE_PX = 1;

export function expectSameBox({
	actual,
	expected,
	label,
	edges = ["x", "y", "width", "height"],
}: {
	actual: Box;
	expected: Box;
	label: string;
	edges?: (keyof Box)[];
}): void {
	for (const edge of edges) {
		expect(
			Math.abs(actual[edge] - expected[edge]),
			`${label} ${edge}: ${actual[edge]} vs ${expected[edge]}`,
		).toBeLessThanOrEqual(TOLERANCE_PX);
	}
}
