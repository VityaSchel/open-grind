// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getGendersMock } = vi.hoisted(() => ({ getGendersMock: vi.fn() }));

vi.mock("$lib/api/users/genders", () => ({ getGenders: getGendersMock }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import type { Gender } from "$lib/model/users/genders";
import GendersFilter from "./GendersFilter.svelte";

const genders: Gender[] = [
	{
		genderId: 1,
		gender: "Man",
		genderPlural: "Men",
		displayGroup: 1,
		sortFilter: 1,
	},
	{
		genderId: 3,
		gender: "Trans Woman",
		genderPlural: "Trans Women",
		displayGroup: 2,
		sortFilter: 2,
	},
];

const renderFilter = () =>
	render(GendersFilter, { props: { checked: false, value: [] } });

beforeEach(() => {
	getGendersMock.mockReset();
	getGendersMock.mockResolvedValue(genders);
});

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("GendersFilter", () => {
	it("shows the other genders behind More, then offers Less", async () => {
		renderFilter();
		const more = await screen.findByRole("button", { name: "More" });

		expect(screen.getByRole("checkbox", { name: "Gender" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Not specified" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Trans Women" }),
		).toBeNull();

		await fireEvent.click(more);

		expect(screen.getByRole("button", { name: "Less" })).toBe(more);
		expect(
			screen.getByRole("button", { name: "Trans Women" }),
		).toBeTruthy();
	});

	it("words the field, the unspecified chip and the toggle in the active locale", async () => {
		renderFilter();
		const toggle = await screen.findByRole("button", { name: "More" });
		const field = screen.getByRole("checkbox", { name: "Gender" });
		const notSpecified = screen.getByRole("button", {
			name: "Not specified",
		});

		await setLocale({ locale: "en-XA" });

		expect(screen.getByRole("checkbox", { name: PSEUDO_MESSAGE })).toBe(
			field,
		);
		expect(notSpecified.textContent).toMatch(PSEUDO_MESSAGE);
		const more = toggle.textContent;
		expect(more).toMatch(PSEUDO_MESSAGE);

		await fireEvent.click(toggle);

		expect(toggle.textContent).toMatch(PSEUDO_MESSAGE);
		expect(toggle.textContent).not.toBe(more);
	});

	it("says when the genders fail to load, in the active locale", async () => {
		getGendersMock.mockRejectedValue(new Error("offline"));
		renderFilter();
		const failure = await screen.findByText("Failed to load genders");

		await setLocale({ locale: "en-XA" });

		expect(failure.textContent).toMatch(PSEUDO_MESSAGE);
	});
});
