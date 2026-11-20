// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	bracketCounts,
	restoreCountFormatter,
} from "#lib/i18n/fixtures/count-formatter.ts";
import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { Option } from "#lib/util/options.ts";
import ComboField from "./ComboField.svelte";

const OPTIONS: Option<number>[] = [
	{ value: 1, label: "Bear" },
	{ value: 2, label: "Otter" },
	{ value: 3, label: "Twink" },
	{ value: 4, label: "Daddy" },
];

function renderField(props: Partial<Record<string, unknown>> = {}) {
	return render(ComboField, {
		props: {
			label: "Tribes",
			values: [],
			options: OPTIONS,
			searchPlaceholder: "Search tribes…",
			...props,
		},
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
	const input = screen.getByRole<HTMLInputElement>("combobox", {
		name: "Tribes",
	});
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

beforeEach(() => {
	runningOn("linux");
});

afterEach(async () => {
	cleanup();
	resetPlatform();
	restoreCountFormatter();
	await setLocale({ locale: SOURCE_LOCALE });
});

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

describe("ComboField chip keys", () => {
	function removeButton(label: string): HTMLButtonElement {
		return screen.getByRole("button", { name: `Remove ${label}` });
	}

	it("makes the chip row one Tab stop named after the field", async () => {
		renderField({ values: [1, 2, 3] });
		await tick();

		const toolbar = screen.getByRole("toolbar", { name: "Tribes" });
		expect(
			[...toolbar.querySelectorAll("button")].map((button) =>
				button.getAttribute("tabindex"),
			),
		).toEqual(["0", "-1", "-1"]);
	});

	it.each(["Delete", "Backspace"])(
		"removes the focused chip with %s and moves to the next one",
		async (key) => {
			const { container } = renderField({ values: [1, 2, 3] });
			removeButton("Otter").focus();

			await fireEvent.keyDown(removeButton("Otter"), { key });
			await tick();

			expect(chipLabels(container)).toEqual(["Bear", "Twink"]);
			expect(document.activeElement).toBe(removeButton("Twink"));
			expect(screen.getByRole("status").textContent).toBe(
				"Removed Otter",
			);
		},
	);

	it("moves to the previous chip after removing the last one by keyboard", async () => {
		renderField({ values: [1, 2] });
		removeButton("Otter").focus();

		await fireEvent.click(removeButton("Otter"), { detail: 0 });
		await tick();

		expect(document.activeElement).toBe(removeButton("Bear"));
	});

	it("hands focus to the search input after removing the only chip by keyboard", async () => {
		renderField({ values: [1] });
		removeButton("Bear").focus();

		await fireEvent.keyDown(removeButton("Bear"), { key: "Delete" });
		await tick();

		expect(document.activeElement).toBe(
			screen.getByRole("combobox", { name: "Tribes" }),
		);
	});

	it("leaves focus alone when a pointer removes the only chip", async () => {
		renderField({ values: [1] });

		await fireEvent.click(removeButton("Bear"), { detail: 1 });
		await tick();

		expect(document.activeElement).not.toBe(
			screen.getByRole("combobox", { name: "Tribes" }),
		);
	});

	it("focuses the last chip on Backspace in the empty search input", async () => {
		renderField({ values: [1, 2] });
		const input = screen.getByRole("combobox", { name: "Tribes" });
		input.focus();

		await fireEvent.keyDown(input, { key: "Backspace" });
		await tick();

		expect(document.activeElement).toBe(removeButton("Otter"));
	});

	it("stays in the empty search while Backspace is held", async () => {
		const { container } = renderField({ values: [1, 2] });
		const input = screen.getByRole("combobox", { name: "Tribes" });
		input.focus();

		for (let press = 0; press < 3; press++)
			await fireEvent.keyDown(input, { key: "Backspace", repeat: true });
		await tick();

		expect(document.activeElement).toBe(input);
		expect(chipLabels(container)).toEqual(["Bear", "Otter"]);
	});

	describe("while the soft keyboard is shown", () => {
		beforeEach(() => {
			runningOn("android");
			window.__AndroidInsets = {
				top: () => 0,
				bottom: () => 0,
				left: () => 0,
				right: () => 0,
				imeVisible: () => true,
			};
		});

		afterEach(() => {
			delete window.__AndroidInsets;
		});

		it("keeps Backspace in the empty search", async () => {
			renderField({ values: [1, 2] });
			const input = screen.getByRole("combobox", { name: "Tribes" });
			input.focus();

			await fireEvent.keyDown(input, { key: "Backspace" });
			await tick();

			expect(document.activeElement).toBe(input);
		});
	});

	it.each(["Delete", "Backspace", "Enter"])(
		"removes only one chip while %s is held",
		async (key) => {
			const { container } = renderField({ values: [1, 2, 3] });
			removeButton("Otter").focus();
			await fireEvent.keyDown(removeButton("Otter"), { key: "Delete" });
			await tick();

			const kept = await fireEvent.keyDown(removeButton("Twink"), {
				key,
				repeat: true,
			});
			await tick();

			expect(kept).toBe(false);
			expect(chipLabels(container)).toEqual(["Bear", "Twink"]);
			expect(document.activeElement).toBe(removeButton("Twink"));
		},
	);

	it("announces a second removal of the same chip", async () => {
		const { rerender } = renderField({ values: [1, 2, 3] });
		removeButton("Otter").focus();
		await fireEvent.keyDown(removeButton("Otter"), { key: "Delete" });
		await vi.waitFor(() =>
			expect(screen.getByRole("status").textContent).toBe(
				"Removed Otter",
			),
		);
		await rerender({ values: [1, 2, 3] });
		const status = screen.getByRole("status");
		const spoken: string[] = [];
		const changes = new MutationObserver(() =>
			spoken.push(status.textContent),
		);
		changes.observe(status, {
			childList: true,
			characterData: true,
			subtree: true,
		});

		await fireEvent.keyDown(removeButton("Otter"), { key: "Delete" });
		await vi.waitFor(() => expect(spoken).toContain("Removed Otter"));
		changes.disconnect();
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

	it("prints the count and the maximum with the count formatter", () => {
		const bracketed = bracketCounts();
		const { container } = renderField({ values: [1], max: 3 });

		expect(hint(container)).toBe(
			`${bracketed(1)}/${bracketed(3)} selected`,
		);
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

describe("ComboField copy", () => {
	it("keeps the option names out of page translation", async () => {
		const { container } = renderField({ values: [2] });
		await openList();

		expect(
			[...container.querySelectorAll("[translate=no]")].map((element) =>
				element.textContent.trim(),
			),
		).toEqual(["Otter"]);
		expect(
			[...document.querySelectorAll("[role=option]")].map((option) =>
				option.getAttribute("translate"),
			),
		).toEqual(["no", "no", "no", "no"]);
	});

	it("words its hint and its button names in the active locale", async () => {
		const { container } = renderField({ values: [1], max: 3 });
		const removeButton = screen.getByRole("button", {
			name: "Remove Bear",
		});
		const listToggle = screen.getByRole("button", { name: "Toggle list" });

		await setLocale({ locale: "en-XA" });

		expect(hint(container)).toMatch(PSEUDO_MESSAGE);
		expect(hint(container)).toContain("1/3");
		expect(removeButton.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
		expect(removeButton.getAttribute("aria-label")).toContain("Bear");
		expect(listToggle.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
	});
});
