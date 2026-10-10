// @vitest-environment jsdom

import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import {
	HealthPractice,
	HivStatus,
	LookingFor,
	type Profile,
	Tribe,
	Vaccine,
} from "$lib/model/users/profiles";
import { fullProfile, OUR_ID } from "./pager/profile-pager-test-helpers";
import { ProfileState } from "./profile-state.svelte";
import ProfileBody from "./ProfileBody.svelte";

const PROFILE_ID = 100001;

function renderedFields(overrides: Partial<Profile>): string[] {
	const profile = { ...fullProfile({ profileId: PROFILE_ID }), ...overrides };
	const profileState = new ProfileState({
		profileId: PROFILE_ID,
		ourProfileId: OUR_ID,
		fetched: { profile, note: null },
	});
	const { container } = render(ProfileBody, { props: { profileState } });
	return [...container.querySelectorAll("[data-slot=profile-field]")].map(
		(field) => field.textContent.replace(/\s+/g, " ").trim(),
	);
}

describe("ProfileBody", () => {
	it("lists the tribes the profile is into first among its expectations", () => {
		const fields = renderedFields({
			tribesImInto: [Tribe.Bear, Tribe.Otter],
			lookingFor: [LookingFor.Chat],
		});

		const imInto = fields.indexOf("I'm Into Bear, Otter");
		expect(imInto).toBeGreaterThanOrEqual(0);
		expect(fields[imInto + 1]).toBe("Looking For Chat");
	});

	it("lists vaccinations between the last test and health practices", () => {
		const fields = renderedFields({
			hivStatus: HivStatus.Negative,
			lastTestedDate: Date.UTC(2026, 8, 15),
			vaccines: [Vaccine.COVID19, Vaccine.Meningitis],
			sexualHealth: [HealthPractice.Condoms],
		});

		const vaccinated = fields.indexOf(
			"Vaccinated for COVID-19, Meningitis",
		);
		expect(vaccinated).toBeGreaterThanOrEqual(0);
		expect(fields[vaccinated - 1]).toMatch(/^Last Tested /);
		expect(fields[vaccinated + 1]).toMatch(/^Health Practices /);
	});
});
