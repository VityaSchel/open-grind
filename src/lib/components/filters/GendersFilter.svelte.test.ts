// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoGenders } from "$lib/demo/mock/reference";
import { GENDER_ASK_ME } from "$lib/model/browse/grid/filters";
import type { Gender } from "$lib/model/users/genders";

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

vi.mock("$lib/api/users/genders", () => ({
	getGenders: () => Promise.resolve(catalog),
}));

import GendersFilter from "./GendersFilter.svelte";

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

afterEach(cleanup);

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
});
