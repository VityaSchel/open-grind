// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { preferences, patchOwnProfile, showErrorToast } = vi.hoisted(() => ({
	preferences: { units: "metric" },
	patchOwnProfile: vi.fn(() => Promise.resolve()),
	showErrorToast: vi.fn<(options: { label?: string }) => void>(),
}));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => preferences,
}));
vi.mock("$lib/api/users/profiles", () => ({
	getProfile: () => Promise.resolve({ showDistance: true }),
	patchOwnProfile,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import ShowDistanceSetting from "./ShowDistanceSetting.svelte";

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	preferences.units = "metric";
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("ShowDistanceSetting", () => {
	it("gives its example distance in kilometres when metric is chosen", () => {
		render(ShowDistanceSetting, { props: { ourProfileId: 1 } });

		expect(screen.getByText(/e\.g\. 2\.4 km\.$/)).toBeTruthy();
	});

	it("gives its example distance in miles when imperial is chosen", () => {
		preferences.units = "imperial";
		render(ShowDistanceSetting, { props: { ourProfileId: 1 } });

		expect(screen.getByText(/e\.g\. 1\.5 mi\.$/)).toBeTruthy();
		expect(screen.queryByText(/km/)).toBeNull();
	});

	it("words its title and description in the active locale", async () => {
		render(ShowDistanceSetting, { props: { ourProfileId: 1 } });
		const title = screen.getByText("Show my distance");
		const description = screen.getByText(/e\.g\. 2\.4 km\.$/);

		await setLocale({ locale: "en-XA" });

		expect(title.textContent).toMatch(PSEUDO_MESSAGE);
		expect(description.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		expect(description.textContent).toContain("2.4 km");
	});

	it("turns back and says so when the change can’t be saved", async () => {
		patchOwnProfile.mockRejectedValueOnce(new Error("down"));
		render(ShowDistanceSetting, { props: { ourProfileId: 1 } });
		const toggle = screen.getByRole("switch");
		await vi.waitFor(() =>
			expect(toggle.getAttribute("aria-checked")).toBe("true"),
		);

		await fireEvent.click(toggle);

		await vi.waitFor(() =>
			expect(showErrorToast).toHaveBeenCalledWith(
				expect.objectContaining({ label: "Couldn’t save setting" }),
			),
		);
		expect(toggle.getAttribute("aria-checked")).toBe("true");
	});
});
