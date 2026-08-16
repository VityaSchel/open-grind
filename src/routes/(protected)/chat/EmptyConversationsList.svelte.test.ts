// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import EmptyConversationsList from "./EmptyConversationsList.svelte";

describe("EmptyConversationsList", () => {
	afterEach(() => cleanup());

	it("invites the user to browse when nothing is filtered", () => {
		render(EmptyConversationsList);

		expect(screen.getByText("No Conversations Yet")).toBeTruthy();
		expect(screen.getByRole("link", { name: "Grid" })).toBeTruthy();
	});

	it("reports no results for the active filters instead of a favorites-specific message", () => {
		render(EmptyConversationsList, { filtered: true });

		expect(screen.getByText("No Results")).toBeTruthy();
		expect(
			screen.getByText("No conversations match these filters."),
		).toBeTruthy();
		expect(screen.queryByRole("link")).toBeNull();
	});
});
