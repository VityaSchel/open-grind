import type { Locator, Page } from "@playwright/test";

import { runPaletteCommand } from "../../../e2e/support/app";
import { openAllFilters } from "../../../e2e/support/grid-filters";
import type { Scene } from ".";
import { showGrid } from "./browse-states";
import { CONNECT_FAILED } from "./faults";

const FILTERS = '[role="dialog"]';
const TAGS_FILTER = `${FILTERS} div:has(> [data-slot="filter-field"] [id^="filters-tags-"])`;
const TAGS_SEARCH = `${FILTERS} #search-tags`;
const PICKED_TAGS = ["Coffee", "Travel", "Music"];
const PASTIMES = [
	"Baking",
	"Biking",
	"Birdwatching",
	"Boating",
	"Bouldering",
	"Bowling",
	"Brewing",
	"Camping",
	"Canoeing",
	"Climbing",
	"Composing",
	"Cooking",
	"Crocheting",
	"Cycling",
	"Dancing",
	"Diving",
	"Drawing",
	"Fencing",
	"Fishing",
	"Gardening",
	"Golfing",
	"Hiking",
	"Jogging",
	"Journaling",
	"Juggling",
	"Kayaking",
	"Kitesurfing",
	"Knitting",
	"Meditating",
	"Paddling",
	"Painting",
	"Quilting",
	"Rafting",
	"Reading",
	"Roller skating",
	"Rowing",
	"Running",
	"Sailing",
	"Scrapbooking",
	"Sewing",
	"Singing",
	"Skating",
	"Sketching",
	"Skiing",
	"Snorkeling",
	"Snowboarding",
	"Stargazing",
	"Stretching",
	"Surfing",
	"Swimming",
	"Traveling",
	"Volunteering",
	"Weaving",
	"Windsurfing",
	"Woodworking",
	"Writing",
];
const PASTIME_TAGS = [
	{
		language: "en",
		categoryCollection: [
			{
				text: "Interests",
				possessiveText: null,
				tags: PASTIMES.map((text, index) => ({
					tagId: index + 1,
					text,
					key: text.toLowerCase().replaceAll(" ", "-"),
				})),
			},
		],
	},
];

function filtersCheckbox({ page, name }: { page: Page; name: string }) {
	return page.locator(FILTERS).getByRole("checkbox", { name });
}

function tagChip({ page, name }: { page: Page; name: string }): Locator {
	return page.locator(TAGS_FILTER).getByRole("button", { name, exact: true });
}

async function openTags(page: Page): Promise<void> {
	await showGrid(page);
	await openAllFilters(page);
	await filtersCheckbox({ page, name: "Tags" }).click();
	await page.locator(TAGS_SEARCH).waitFor();
}

async function searchTags({
	page,
	query,
	shows,
}: {
	page: Page;
	query: string;
	shows: string;
}): Promise<void> {
	await page.locator(TAGS_SEARCH).fill(query);
	const message = page.locator(TAGS_FILTER).getByText(shows);
	await message.waitFor();
	await message.scrollIntoViewIfNeeded();
}

export const bodyFilters: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/filters/height-weight",
			screen: "browse/grid",
			drive: async (page) => {
				await showGrid(page);
				await openAllFilters(page);
				for (const name of ["Height", "Weight"]) {
					await filtersCheckbox({ page, name }).click();
				}
				const weightMaximum = page
					.locator(FILTERS)
					.getByRole("slider", { name: "Maximum Weight" });
				await weightMaximum.waitFor();
				await weightMaximum.scrollIntoViewIfNeeded();
			},
		},
	],
};

export const tagFilters: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/filters/tags",
			screen: "browse/grid",
			drive: async (page) => {
				await openTags(page);
				for (const name of PICKED_TAGS) {
					await tagChip({ page, name }).click();
				}
				await page
					.locator(TAGS_FILTER)
					.getByRole("button", { name: "More" })
					.click();
				const less = page
					.locator(TAGS_FILTER)
					.getByRole("button", { name: "Less" });
				await less.waitFor();
				await page
					.locator(TAGS_FILTER)
					.getByText(`${PICKED_TAGS.length} selected`)
					.scrollIntoViewIfNeeded();
			},
		},
		{
			id: "browse/filters/tags/no-matches",
			screen: "browse/grid",
			drive: (page) =>
				searchTags({
					page,
					query: "zzz",
					shows: "No tags match “zzz”",
				}),
		},
	],
};

export const tagSearchTruncated: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			{
				method: "GET",
				path: "/v1/tags",
				status: 200,
				body: PASTIME_TAGS,
			},
		],
	},
	views: [
		{
			id: "browse/filters/tags/truncated",
			screen: "browse/grid",
			drive: async (page) => {
				await openTags(page);
				await searchTags({
					page,
					query: "ing",
					shows: `Showing the first 50 of ${PASTIMES.length} matches`,
				});
			},
		},
	],
};

export const tagsLoadFailure: Scene = {
	platform: "phone",
	demo: {
		restFaults: [
			{ method: "GET", path: "/v1/tags", error: CONNECT_FAILED },
		],
	},
	views: [
		{
			id: "browse/filters/tags/load-failed",
			screen: "browse/grid",
			drive: async (page) => {
				await showGrid(page);
				await runPaletteCommand(page, "?tags=coffee");
				await openAllFilters(page);
				const failure = page
					.locator(TAGS_FILTER)
					.getByText("Couldn’t load tags");
				await failure.waitFor();
				await failure.scrollIntoViewIfNeeded();
			},
		},
	],
};

async function openQuickFilter({
	page,
	pill,
	switchLabel,
}: {
	page: Page;
	pill: string;
	switchLabel: string;
}): Promise<void> {
	await page.locator("main").getByRole("button", { name: pill }).click();
	await page
		.getByRole("dialog", { name: pill })
		.getByRole("switch", { name: switchLabel })
		.waitFor();
}

export const quickFilters: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/quick-filters/age",
			screen: "browse/grid",
			drive: async (page) => {
				await showGrid(page);
				await openQuickFilter({
					page,
					pill: "Age",
					switchLabel: "Filter by Age",
				});
			},
		},
		{
			id: "browse/quick-filters/position",
			screen: "browse/grid",
			drive: async (page) => {
				const ageDrawer = page.getByRole("dialog", { name: "Age" });
				await ageDrawer.getByRole("button", { name: "Apply" }).click();
				await ageDrawer.waitFor({ state: "hidden" });
				await openQuickFilter({
					page,
					pill: "Position",
					switchLabel: "Filter by Position",
				});
			},
		},
	],
};
