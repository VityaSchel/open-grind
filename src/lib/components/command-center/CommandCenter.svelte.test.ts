// @vitest-environment jsdom

import { cleanup, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { slot } from "$lib/i18n/fixtures/dom";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { commandCenterState } from "./command-center-state.svelte";
import {
	enterQuery,
	openCommandCenter,
	options,
} from "./command-center-test-helpers";

const textOf = (element: HTMLElement) => element.textContent.trim();

afterEach(async () => {
	cleanup();
	commandCenterState.open = false;
	commandCenterState.query = "";
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("CommandCenter", () => {
	it("prompts for a command and suggests each prefix", () => {
		openCommandCenter();

		expect(screen.getByRole("combobox")).toHaveProperty(
			"placeholder",
			"Type a command…",
		);
		expect(screen.getByRole("listbox").getAttribute("aria-label")).toBe(
			"Suggestions…",
		);
		const suggestions = screen.getByRole("group", { name: "Suggestions" });
		expect(within(suggestions).getAllByRole("option").map(textOf)).toEqual([
			"Start with # to open profile by ID",
			"Start with ? to filter grid",
			"Start with / to quick go to",
			"Start with @ to set location by geohash",
		]);
	});

	it("reports a query no command matches", async () => {
		openCommandCenter();

		await enterQuery("zz");

		await vi.waitFor(() =>
			expect(textOf(slot("command-empty"))).toBe("Unknown command"),
		);
		expect(options()).toEqual([]);
	});

	it("words the input, suggestions and empty state in the active locale", async () => {
		openCommandCenter();
		const group = slot("command-group");

		await setLocale({ locale: "en-XA" });

		expect(
			screen.getByRole("combobox").getAttribute("placeholder"),
		).toMatch(PSEUDO_MESSAGE);
		expect(screen.getByRole("listbox").getAttribute("aria-label")).toMatch(
			PSEUDO_MESSAGE,
		);
		expect(screen.getByRole("group", { name: PSEUDO_MESSAGE })).toBe(
			within(group).getByRole("group"),
		);
		expect(group.dataset.value).toBe("suggestions");
		expect(options()).toHaveLength(4);
		for (const suggestion of options()) {
			expect(textOf(suggestion)).toMatch(PSEUDO_MESSAGE);
		}

		await enterQuery("zz");

		await vi.waitFor(() =>
			expect(textOf(slot("command-empty"))).toMatch(PSEUDO_MESSAGE),
		);
	});
});
