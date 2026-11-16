// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getTagsMock } = vi.hoisted(() => ({ getTagsMock: vi.fn() }));

vi.mock("#lib/api/users/tags.ts", () => ({ getTags: getTagsMock }));

import { restoreCountFormatter } from "#lib/i18n/fixtures/count-formatter.ts";
import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import {
	setCountFormatter,
	setLocale,
	SOURCE_LOCALE,
} from "#lib/i18n/index.ts";
import type { ProfileTagsResponse } from "#lib/model/users/tags.ts";
import TagsFilter from "./TagsFilter.svelte";

const SEARCH_RESULTS_SHOWN = 50;
const MATCHING_TAGS = SEARCH_RESULTS_SHOWN + 10;
const matchesNotice = (format: (value: number) => string) =>
	`${format(MATCHING_TAGS)} tags match.`;
const shownNotice = (format: (value: number) => string) =>
	`Showing the first ${format(SEARCH_RESULTS_SHOWN)}. Keep typing to narrow the results.`;

const tag = (tagId: number, text: string) => ({
	tagId,
	key: text.toLowerCase().replaceAll(" ", "-"),
	text,
});

const shortTags = ["Coffee", "Hiking", "Books", "Dogs", "Cats", "Tea"].map(
	(text, index) => tag(index + 1, text),
);
const longTag = tag(7, "Really long tag name here");
const matchingTags = Array.from({ length: MATCHING_TAGS }, (_, index) =>
	tag(100 + index, `Match ${index}`),
);

const languages: ProfileTagsResponse = [
	{
		language: "en",
		categoryCollection: [
			{
				text: "Interests",
				possessiveText: null,
				tags: [...shortTags, longTag],
			},
			{ text: "Matches", possessiveText: null, tags: matchingTags },
		],
	},
];

function renderFilter(value: string[] = []) {
	render(TagsFilter, { props: { checked: true, value } });
}

async function search(query: string) {
	await screen.findByRole("button", { name: "Coffee" });
	await fireEvent.input(screen.getByRole("searchbox"), {
		target: { value: query },
	});
}

beforeEach(() => {
	getTagsMock.mockReset();
	getTagsMock.mockResolvedValue(languages);
});

afterEach(async () => {
	cleanup();
	restoreCountFormatter();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("TagsFilter", () => {
	it("counts the selection once it is too long to list", async () => {
		renderFilter(shortTags.map(({ key }) => key));

		const selected = await screen.findByText("6 selected");

		await setLocale({ locale: "en-XA" });

		expect(selected.textContent).toMatch(PSEUDO_MESSAGE);
	});

	it("counts a single selection whose text is too long to show", async () => {
		renderFilter([longTag.key]);

		const selected = await screen.findByText("1 selected");

		await setLocale({ locale: "en-XA" });

		expect(selected.textContent).toMatch(PSEUDO_MESSAGE);
	});

	it("labels the field, the search box and the More toggle in the active locale", async () => {
		renderFilter();
		const toggle = await screen.findByRole("button", { name: "More" });
		const field = screen.getByRole("checkbox", { name: "Tags" });
		const searchBox = screen.getByPlaceholderText("Search tags…");

		await setLocale({ locale: "en-XA" });

		expect(screen.getByRole("checkbox", { name: PSEUDO_MESSAGE })).toBe(
			field,
		);
		expect(searchBox.getAttribute("placeholder")).toMatch(PSEUDO_MESSAGE);
		const more = toggle.textContent;
		expect(more).toMatch(PSEUDO_MESSAGE);

		await fireEvent.click(toggle);

		expect(toggle.textContent).toMatch(PSEUDO_MESSAGE);
		expect(toggle.textContent).not.toBe(more);
	});

	it("toggles the hidden categories with More and Less", async () => {
		renderFilter();
		const toggle = await screen.findByRole("button", { name: "More" });

		await fireEvent.click(toggle);

		expect(screen.getByRole("button", { name: "Less" })).toBe(toggle);
	});

	it("tells how many matches a long search leaves out", async () => {
		renderFilter();
		await search("match");

		const matches = await screen.findByText(matchesNotice(String));
		const shown = screen.getByText(shownNotice(String));

		await setLocale({ locale: "en-XA" });

		expect(matches.textContent).toMatch(PSEUDO_MESSAGE);
		expect(matches.textContent).toContain(String(MATCHING_TAGS));
		expect(shown.textContent).toMatch(PSEUDO_MESSAGE);
		expect(shown.textContent).toContain(String(SEARCH_RESULTS_SHOWN));
	});

	it("prints both numbers of the notice with the count formatter", async () => {
		const bracketed = (value: number) => `[${value}]`;
		setCountFormatter(({ count }) => bracketed(count));
		renderFilter();
		await search("match");

		const matches = await screen.findByText(/ tags match\.$/);

		expect(matches.textContent).toBe(matchesNotice(bracketed));
		expect(screen.getByText(/^Showing the first /).textContent).toBe(
			shownNotice(bracketed),
		);
	});

	it("quotes a search that matches no tag", async () => {
		renderFilter();
		await search("x");

		const empty = await screen.findByText("No tags match “x”");

		await setLocale({ locale: "en-XA" });

		expect(empty.textContent).toMatch(PSEUDO_MESSAGE);
		expect(empty.textContent).toContain("“x”");
	});

	it("says when the tags fail to load, in the active locale", async () => {
		getTagsMock.mockRejectedValue(new Error("offline"));
		renderFilter();
		const failure = await screen.findByText("Couldn’t load tags");

		await setLocale({ locale: "en-XA" });

		expect(failure.textContent).toMatch(PSEUDO_MESSAGE);
	});
});
