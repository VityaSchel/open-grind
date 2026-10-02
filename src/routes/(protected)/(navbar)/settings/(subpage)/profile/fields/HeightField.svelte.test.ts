// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ units: "metric" }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => preferences,
}));

import HeightField from "./HeightField.svelte";

function renderField(heightCm: number | null) {
	const stored = $state({ heightCm });
	const { container } = render(HeightField, {
		props: {
			get value() {
				return stored.heightCm;
			},
			set value(next: number | null) {
				stored.heightCm = next;
			},
		},
	});
	return { stored, container };
}

const picker = () => screen.getByRole("button", { name: /^Height / });

async function openMenu() {
	await fireEvent.keyDown(picker(), { key: "Enter" });
	await new Promise((resolve) => setTimeout(resolve, 0));
	return [...document.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
}

const labelOf = (item: Element) => item.textContent?.trim();

async function pick(label: string) {
	const items = await openMenu();
	await fireEvent.click(items.find((item) => labelOf(item) === label)!);
}

beforeEach(() => {
	Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
	cleanup();
	preferences.units = "metric";
});

describe("HeightField in imperial units", () => {
	it("shows the stored centimetres as feet and inches", () => {
		preferences.units = "imperial";
		const { container } = renderField(180);

		expect(picker().textContent?.trim()).toBe("5'11\"");
		expect(container.textContent).not.toContain("cm");
		expect(screen.queryByRole("textbox")).toBeNull();
	});

	it("stores a picked height as centimetres", async () => {
		preferences.units = "imperial";
		const { stored } = renderField(180);

		await pick("6'0\"");

		expect(stored.heightCm).toBe(183);
		expect(picker().textContent?.trim()).toBe("6'0\"");
	});

	it("keeps the stored height when the shown one is picked again", async () => {
		preferences.units = "imperial";
		const { stored } = renderField(179);

		expect(picker().textContent?.trim()).toBe("5'10\"");
		await pick("5'10\"");

		expect(stored.heightCm).toBe(179);
	});

	it("offers every height from the shortest to the tallest supported one", async () => {
		preferences.units = "imperial";
		renderField(null);

		const offered = (await openMenu()).map(labelOf);

		expect(offered).toHaveLength(53);
		expect(offered.slice(0, 3)).toEqual(["Not set", "3'11\"", "4'0\""]);
		expect(offered.at(-1)).toBe("8'2\"");
	});

	it("opens from the keyboard with the shown height focused", async () => {
		preferences.units = "imperial";
		renderField(180);

		await openMenu();
		await new Promise((resolve) => requestAnimationFrame(resolve));
		await tick();

		expect(labelOf(document.activeElement!)).toBe("5'11\"");
	});

	it("never stores less than the shortest supported height", async () => {
		preferences.units = "imperial";
		const { stored } = renderField(180);

		await pick("3'11\"");

		expect(stored.heightCm).toBe(120);
		expect(picker().textContent?.trim()).toBe("3'11\"");
	});

	it("clears the stored height when Not set is picked", async () => {
		preferences.units = "imperial";
		const { stored } = renderField(180);

		await pick("Not set");

		expect(stored.heightCm).toBeNull();
	});
});

describe("HeightField in metric units", () => {
	it("shows and stores whole centimetres", async () => {
		const { stored, container } = renderField(180);
		const input = screen.getByRole<HTMLInputElement>("textbox", {
			name: "Height",
		});

		expect(input.value).toBe("180");
		expect(container.textContent).toContain("cm");

		await fireEvent.focus(input);
		await fireEvent.input(input, { target: { value: "175" } });

		expect(stored.heightCm).toBe(175);
	});
});
