// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setRegionalSettings } from "$lib/i18n";
import { webRegionalSettings } from "$lib/i18n/regional";
import type { ProfileListProfile } from "./profile-list";
import ProfileListRow from "./ProfileListRow.svelte";

const icon = createRawSnippet(() => ({ render: () => "<span></span>" }));

function renderRow({
	profile,
	control,
	label,
}: {
	profile: ProfileListProfile | null;
	control: "button" | "checkbox";
	label: string;
}) {
	return render(ProfileListRow, {
		props: {
			profileId: 100802,
			profile,
			on: true,
			submitting: false,
			onToggle: () => {},
			icon,
			control,
			label,
		},
	});
}

afterEach(() => {
	cleanup();
	setRegionalSettings(webRegionalSettings());
});

describe("ProfileListRow", () => {
	it("identifies an unavailable profile by its id in plain digits", () => {
		setRegionalSettings({ locale: "de-DE", numberingSystem: "arab" });
		renderRow({ profile: null, control: "button", label: "Blocked" });

		expect(screen.getByText("Unavailable profile")).toBeTruthy();
		expect(screen.getByText("ID: 100802")).toBeTruthy();
		expect(
			screen.getByRole("switch", { name: "Blocked: ID 100802" }),
		).toBeTruthy();
	});

	it("names the toggle after the profile it changes", () => {
		renderRow({
			profile: {
				profileId: 100802,
				displayName: "Sam",
				profileImageMediaHash: null,
				onlineUntil: null,
				distance: null,
			} as unknown as ProfileListProfile,
			control: "checkbox",
			label: "Sharing",
		});

		expect(
			screen.getByRole("checkbox", { name: "Sharing: Sam" }),
		).toBeTruthy();
	});
});
