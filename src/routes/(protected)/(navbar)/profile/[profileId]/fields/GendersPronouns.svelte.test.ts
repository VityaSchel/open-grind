// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Gender } from "$lib/model/users/genders";
import type { Pronoun } from "$lib/model/users/pronouns";

const { getGendersMock, getPronounsMock } = vi.hoisted(() => ({
	getGendersMock: vi.fn<() => Promise<Gender[]>>(),
	getPronounsMock: vi.fn<() => Promise<Pronoun[]>>(),
}));

vi.mock("$lib/api/users/genders", () => ({ getGenders: getGendersMock }));
vi.mock("$lib/api/users/pronouns", () => ({ getPronouns: getPronounsMock }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import GendersPronouns from "./GendersPronouns.svelte";

const UNKNOWN_ID = 99;

const genders: Gender[] = [
	{ genderId: 1, gender: "Man", displayGroup: 1 },
	{ genderId: 3, gender: "Trans Woman", displayGroup: 2 },
];

const pronouns: Pronoun[] = [
	{ pronounId: 1, pronoun: "He/Him" },
	{ pronounId: 2, pronoun: "They/Them" },
];

const GENDER_NAMES = "Man, Trans Woman";
const PRONOUN_NAMES = "He/Him, They/Them";

const failures = [
	{
		kind: "genders",
		lookup: getGendersMock,
		message: "Couldn’t load genders",
		otherNames: PRONOUN_NAMES,
	},
	{
		kind: "pronouns",
		lookup: getPronounsMock,
		message: "Couldn’t load pronouns",
		otherNames: GENDER_NAMES,
	},
];

const renderField = () =>
	render(GendersPronouns, {
		props: { genders: [1, UNKNOWN_ID, 3], pronouns: [1, 2] },
	});

beforeEach(() => {
	getGendersMock.mockReset();
	getGendersMock.mockResolvedValue(genders);
	getPronounsMock.mockReset();
	getPronounsMock.mockResolvedValue(pronouns);
});

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("GendersPronouns", () => {
	it("joins the server's names for the genders and pronouns it knows", async () => {
		renderField();

		expect(await screen.findByText(GENDER_NAMES)).toBeTruthy();
		expect(await screen.findByText(PRONOUN_NAMES)).toBeTruthy();
	});

	it.each(failures)(
		"says when the $kind fail to load",
		async ({ lookup, message, otherNames }) => {
			lookup.mockRejectedValue(new Error("offline"));
			renderField();

			const failure = await screen.findByText(message);

			expect(failure.textContent).toBe(message);
			expect(await screen.findByText(otherNames)).toBeTruthy();
		},
	);

	it.each(failures)(
		"words the $kind failure in the active locale but keeps the server's names",
		async ({ lookup, message, otherNames }) => {
			lookup.mockRejectedValue(new Error("offline"));
			renderField();
			const failure = await screen.findByText(message);
			const names = await screen.findByText(otherNames);

			await setLocale({ locale: "en-XA" });

			expect(failure.textContent).toMatch(PSEUDO_MESSAGE);
			expect(names.textContent.trim()).toBe(otherNames);
		},
	);
});
