// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getGendersMock } = vi.hoisted(() => ({ getGendersMock: vi.fn() }));

vi.mock("$lib/api/users/genders", () => ({ getGenders: getGendersMock }));

import { demoGenders } from "$lib/demo/mock/reference";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { GENDER_ASK_ME } from "$lib/model/browse/grid/filters";
import type { Gender } from "$lib/model/users/genders";
import GendersFilter from "./GendersFilter.svelte";

const MAN = 1;
const CIS_MAN = 4;
const TRANS_WOMAN = 7;
const RETIRED = 99;

const catalog: Gender[] = [
	...demoGenders,
	{
		genderId: RETIRED,
		gender: "Retired",
		displayGroup: 0,
		excludeOnFilterSelection: [TRANS_WOMAN],
	},
];

function renderFilter(genders: number[]) {
	const stored = $state({ checked: true, genders });
	render(GendersFilter, {
		props: {
			get checked() {
				return stored.checked;
			},
			set checked(next: boolean) {
				stored.checked = next;
			},
			get value() {
				return stored.genders;
			},
			set value(next: number[]) {
				stored.genders = next;
			},
		},
	});
	return stored;
}

const chip = (name: string) => screen.queryByRole("button", { name });

async function expectHidden(...names: string[]) {
	await waitFor(() => {
		for (const name of names) expect(chip(name)).toBeNull();
	});
}

beforeEach(() => {
	getGendersMock.mockReset();
	getGendersMock.mockResolvedValue(catalog);
});

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("GendersFilter", () => {
	it("hides Cis Man and Trans Men once Men is picked, and Men once Cis Man is", async () => {
		const stored = renderFilter([]);

		await fireEvent.click(
			await screen.findByRole("button", { name: "Men" }),
		);

		expect(stored.genders).toEqual([MAN]);
		await expectHidden("Cis Man", "Trans Men");

		await fireEvent.click(screen.getByRole("button", { name: "Men" }));
		await fireEvent.click(
			await screen.findByRole("button", { name: "Cis Man" }),
		);

		expect(stored.genders).toEqual([CIS_MAN]);
		await expectHidden("Men");
		expect(chip("Trans Men")).not.toBeNull();
	});

	it("drops a selected gender that is no longer offered when the new pick excludes it", async () => {
		const stored = renderFilter([RETIRED]);

		expect(
			await screen.findByRole("button", { name: "Retired" }),
		).toBeTruthy();
		await fireEvent.click(
			screen.getByRole("button", { name: "Trans Women" }),
		);

		expect(stored.genders).toEqual([TRANS_WOMAN]);
		await expectHidden("Retired");
	});

	it("turns the switch off once only a saved Ask Me would remain", async () => {
		const stored = renderFilter([GENDER_ASK_ME, MAN]);

		await fireEvent.click(
			await screen.findByRole("button", { name: "Men" }),
		);

		expect(stored.genders).toEqual([]);
		expect(stored.checked).toBe(false);
	});

	it("shows the other genders behind More, then offers Less", async () => {
		renderFilter([]);
		const more = await screen.findByRole("button", { name: "More" });

		expect(screen.getByRole("checkbox", { name: "Gender" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Not Specified" }),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Agender" })).toBeNull();

		await fireEvent.click(more);

		expect(screen.getByRole("button", { name: "Less" })).toBe(more);
		expect(screen.getByRole("button", { name: "Agender" })).toBeTruthy();
	});

	it("words the field, the unspecified chip and the toggle in the active locale", async () => {
		renderFilter([]);
		const toggle = await screen.findByRole("button", { name: "More" });
		const field = screen.getByRole("checkbox", { name: "Gender" });
		const notSpecified = screen.getByRole("button", {
			name: "Not Specified",
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
		renderFilter([]);
		const failure = await screen.findByText("Couldn’t load genders");

		await setLocale({ locale: "en-XA" });

		expect(failure.textContent).toMatch(PSEUDO_MESSAGE);
	});
});
