// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ units: "metric" }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => preferences,
}));

import WeightField from "./WeightField.svelte";

function renderField(weightKg: number | null) {
	const stored = $state({ weightKg });
	const { container } = render(WeightField, {
		props: {
			get value() {
				return stored.weightKg;
			},
			set value(next: number | null) {
				stored.weightKg = next;
			},
		},
	});
	return { stored, container };
}

const input = () =>
	screen.getByRole<HTMLInputElement>("textbox", { name: "Weight" });

async function type(text: string) {
	await fireEvent.focus(input());
	await fireEvent.input(input(), { target: { value: text } });
}

afterEach(() => {
	cleanup();
	preferences.units = "metric";
});

describe("WeightField in imperial units", () => {
	it("shows the stored kilograms as whole pounds", () => {
		preferences.units = "imperial";
		const { container } = renderField(80);

		expect(input().value).toBe("176");
		expect(container.textContent).toContain("lb");
		expect(container.textContent).not.toContain("kg");
	});

	it("stores typed pounds as kilograms", async () => {
		preferences.units = "imperial";
		const { stored } = renderField(80);

		await type("180");

		expect(stored.weightKg).toBe(81.6);
	});

	it("keeps the stored weight when the field is entered and left unchanged", async () => {
		preferences.units = "imperial";
		const { stored } = renderField(80);

		await fireEvent.focus(input());
		await fireEvent.blur(input());

		expect(stored.weightKg).toBe(80);
		expect(input().value).toBe("176");
	});

	it("keeps the stored weight when the shown pounds are typed again", async () => {
		preferences.units = "imperial";
		const { stored } = renderField(75);
		expect(input().value).toBe("165");

		await fireEvent.focus(input());
		for (const text of ["16", "165"])
			await fireEvent.input(input(), { target: { value: text } });
		await fireEvent.blur(input());

		expect(stored.weightKg).toBe(75);
		expect(input().value).toBe("165");
	});

	it("drops decimals, because pounds are whole", async () => {
		preferences.units = "imperial";
		const { stored } = renderField(80);

		await type("180.5");

		expect(input().value).toBe("1805");
		await fireEvent.blur(input());
		expect(input().value).toBe("551");
		expect(stored.weightKg).toBe(250);
	});

	it("never stores less than the lightest supported weight", async () => {
		preferences.units = "imperial";
		const { stored } = renderField(80);

		await type("66");
		await fireEvent.blur(input());

		expect(stored.weightKg).toBe(30);
		expect(input().value).toBe("66");
	});

	it("clears the stored weight when the field is emptied", async () => {
		preferences.units = "imperial";
		const { stored } = renderField(80);

		await type("");
		await fireEvent.blur(input());

		expect(stored.weightKg).toBeNull();
	});
});

describe("WeightField in metric units", () => {
	it("shows and stores kilograms in half steps", async () => {
		const { stored, container } = renderField(80);

		expect(input().value).toBe("80");
		expect(container.textContent).toContain("kg");
		expect(container.textContent).not.toContain("lb");

		await type("80.5");

		expect(stored.weightKg).toBe(80.5);
	});
});
