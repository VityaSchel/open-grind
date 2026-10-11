// @vitest-environment jsdom

import { screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { slot } from "$lib/i18n/fixtures/dom";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import {
	enterQuery,
	expectCommandGroup,
	openCommandCenter,
	openWith,
	option,
	options,
	resetCommandCenter,
	textOf,
	type,
} from "./command-center-test-helpers";

const GO_TO_TOKENS = ["/grid", "/chat", "/taps", "/views", "/right-now"];

afterEach(async () => {
	resetCommandCenter();
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
		expectCommandGroup({ name: "Suggestions", value: "suggestions" });
		expect(
			within(slot("command-group")).getAllByRole("option").map(textOf),
		).toEqual([
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

		await setLocale({ locale: "en-XA" });

		expect(
			screen.getByRole("combobox").getAttribute("placeholder"),
		).toMatch(PSEUDO_MESSAGE);
		expect(screen.getByRole("listbox").getAttribute("aria-label")).toMatch(
			PSEUDO_MESSAGE,
		);
		expectCommandGroup({ name: PSEUDO_MESSAGE, value: "suggestions" });
		expect(options()).toHaveLength(4);
		for (const suggestion of options()) {
			expect(textOf(suggestion)).toMatch(PSEUDO_MESSAGE);
		}

		await enterQuery("zz");

		await vi.waitFor(() =>
			expect(textOf(slot("command-empty"))).toMatch(PSEUDO_MESSAGE),
		);
	});

	it("hints at the profile ID under its heading", async () => {
		await openWith("#");

		expectCommandGroup({
			name: "Open profile by ID…",
			value: "open-profile-by-id",
		});
		expect(options().map(textOf)).toEqual([
			"Enter the profile ID to search",
		]);
		expect(option("#")?.getAttribute("translate")).toBeNull();
	});

	it("shows a typed profile ID as typed, untranslated", async () => {
		await openWith("#100002");

		expect(options().map(textOf)).toEqual(["#100002"]);
		expect(option("#100002")?.getAttribute("translate")).toBe("no");
	});

	it("lists the pages to go to by their untranslated tokens", async () => {
		await openWith("/");

		expectCommandGroup({ name: "Quick go to…", value: "quick-go-to" });
		expect(options().map(textOf)).toEqual(GO_TO_TOKENS);
		for (const token of options()) {
			expect(token.getAttribute("translate")).toBe("no");
		}
	});

	it("words the profile ID and go-to commands in the active locale", async () => {
		await openWith("#");
		await setLocale({ locale: "en-XA" });

		expectCommandGroup({
			name: PSEUDO_MESSAGE,
			value: "open-profile-by-id",
		});
		expect(options().map(textOf)).toEqual([
			expect.stringMatching(PSEUDO_MESSAGE),
		]);

		await type("/");

		expectCommandGroup({ name: PSEUDO_MESSAGE, value: "quick-go-to" });
		expect(options().map(textOf)).toEqual(GO_TO_TOKENS);
	});
});
