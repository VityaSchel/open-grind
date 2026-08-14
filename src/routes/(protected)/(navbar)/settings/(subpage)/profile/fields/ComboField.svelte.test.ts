// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import type { Option } from "$lib/util/options";
import ComboField from "./ComboField.svelte";

const OPTIONS: Option<number>[] = [
	{ value: 1, label: "Bear" },
	{ value: 2, label: "Otter" },
	{ value: 3, label: "Twink" },
	{ value: 4, label: "Daddy" },
];

function renderField(props: Partial<Record<string, unknown>> = {}) {
	return render(ComboField, {
		props: { label: "Tribes", values: [], options: OPTIONS, ...props },
	});
}

function chipLabels(container: HTMLElement): string[] {
	return [...container.querySelectorAll("button[aria-label^='Remove ']")].map(
		(button) =>
			(button.getAttribute("aria-label") ?? "").replace("Remove ", ""),
	);
}

function hint(container: HTMLElement): string {
	return container.querySelector("p")?.textContent?.trim() ?? "";
}

async function openList(): Promise<HTMLInputElement> {
	const input = document.querySelector<HTMLInputElement>(
		"input[aria-label='Tribes']",
	)!;
	await fireEvent.click(input);
	await new Promise((resolve) => setTimeout(resolve, 0));
	return input;
}

function listedOptions(): { label: string; disabled: boolean }[] {
	return [...document.querySelectorAll("[role=option]")].map((option) => ({
		label: option.textContent?.trim() ?? "",
		disabled: option.hasAttribute("data-disabled"),
	}));
}

async function search(input: HTMLInputElement, query: string) {
	await fireEvent.input(input, { target: { value: query } });
	await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(cleanup);

describe("ComboField chips", () => {
	it("shows one chip per selected value, labelled from the options", () => {
		const { container } = renderField({ values: [1, 3] });

		expect(chipLabels(container)).toEqual(["Bear", "Twink"]);
	});

	it("prefers resolveLabel over the option label", () => {
		const { container } = renderField({
			values: [1],
			resolveLabel: (id: number) => (id === 1 ? "Ursine" : undefined),
		});

		expect(chipLabels(container)).toEqual(["Ursine"]);
	});

	it("falls back to #id for a value that no option describes", () => {
		const { container } = renderField({ values: [99] });

		expect(chipLabels(container)).toEqual(["#99"]);
	});

	it("drops only the removed value", async () => {
		const { container } = renderField({ values: [1, 2, 3] });

		const remove = container.querySelector<HTMLButtonElement>(
			"button[aria-label='Remove Otter']",
		)!;
		await fireEvent.click(remove);

		expect(chipLabels(container)).toEqual(["Bear", "Twink"]);
	});

	it("renders no chip row when nothing is selected", () => {
		const { container } = renderField();

		expect(chipLabels(container)).toEqual([]);
	});
});

describe("ComboField selection limit", () => {
	it("counts the selection against the maximum", () => {
		const { container } = renderField({ values: [1], max: 3 });

		expect(hint(container)).toBe("1/3 selected");
	});

	it("asks for a removal once the maximum is reached", () => {
		const { container } = renderField({ values: [1, 2, 3], max: 3 });

		expect(hint(container)).toBe(
			"3/3 selected · remove one to add another",
		);
	});

	it("keeps the caller's hint when there is no maximum", () => {
		const { container } = renderField({ values: [1], hint: "Pick a few" });

		expect(hint(container)).toBe("Pick a few");
	});

	it("reports the new count after a chip is removed", async () => {
		const { container } = renderField({ values: [1, 2, 3], max: 3 });

		await fireEvent.click(
			container.querySelector<HTMLButtonElement>(
				"button[aria-label='Remove Bear']",
			)!,
		);

		expect(hint(container)).toBe("2/3 selected");
	});
});

describe("ComboField list", () => {
	it("offers every option when opened", async () => {
		renderField();
		await openList();

		expect(listedOptions().map((option) => option.label)).toEqual([
			"Bear",
			"Otter",
			"Twink",
			"Daddy",
		]);
	});

	it("narrows the list as the query is typed, ignoring case", async () => {
		renderField();
		const input = await openList();

		await search(input, "E");

		expect(listedOptions().map((option) => option.label)).toEqual([
			"Bear",
			"Otter",
		]);
	});

	it("says so when the query matches nothing", async () => {
		renderField();
		const input = await openList();

		await search(input, "zzz");

		expect(listedOptions()).toEqual([]);
		expect(document.body.textContent).toContain("No matches");
	});

	it("blocks the unselected options at the maximum, but never the selected ones", async () => {
		renderField({ values: [1], max: 1 });
		await openList();

		expect(listedOptions()).toEqual([
			{ label: "Bear", disabled: false },
			{ label: "Otter", disabled: true },
			{ label: "Twink", disabled: true },
			{ label: "Daddy", disabled: true },
		]);
	});

	it("blocks exactly the options a selection excludes", async () => {
		renderField({
			values: [1],
			exclude: (id: number) => (id === 1 ? [3] : []),
		});
		await openList();

		expect(listedOptions()).toEqual([
			{ label: "Bear", disabled: false },
			{ label: "Otter", disabled: false },
			{ label: "Twink", disabled: true },
			{ label: "Daddy", disabled: false },
		]);
	});
});
