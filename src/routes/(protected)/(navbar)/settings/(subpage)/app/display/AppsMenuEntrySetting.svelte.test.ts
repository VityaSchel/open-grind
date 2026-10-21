// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { desktopEntry, setDesktopEntryInstalled, showErrorToast } = vi.hoisted(
	() => ({
		desktopEntry: { installed: false },
		setDesktopEntryInstalled:
			vi.fn<(installed: boolean) => Promise<void>>(),
		showErrorToast: vi.fn<(options: { label?: string }) => void>(),
	}),
);

vi.mock("$lib/platform/desktop-entry.svelte", () => ({
	desktopEntryInstalled: () => desktopEntry.installed,
	setDesktopEntryInstalled,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import AppsMenuEntrySetting from "./AppsMenuEntrySetting.svelte";

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	desktopEntry.installed = false;
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("AppsMenuEntrySetting", () => {
	it("words its title and description in the active locale", async () => {
		render(AppsMenuEntrySetting);
		const title = screen.getByText("Show in apps menu");
		const description = screen.getByText(
			"Add Open Grind to your apps menu so it appears in your launcher and gets its icon.",
		);

		await setLocale({ locale: "en-XA" });

		expect(title.textContent).toMatch(PSEUDO_MESSAGE);
		expect(description.textContent.trim()).toMatch(PSEUDO_MESSAGE);
	});

	it.each([
		{
			installed: false,
			label: "Couldn’t add Open Grind to your apps menu",
		},
		{
			installed: true,
			label: "Couldn’t remove Open Grind from your apps menu",
		},
	])(
		"names the failure and turns back when installed is $installed",
		async ({ installed, label }) => {
			desktopEntry.installed = installed;
			setDesktopEntryInstalled.mockRejectedValueOnce(new Error("denied"));
			render(AppsMenuEntrySetting);
			const toggle = screen.getByRole("switch");

			await fireEvent.click(toggle);

			await vi.waitFor(() =>
				expect(showErrorToast).toHaveBeenCalledExactlyOnceWith(
					expect.objectContaining({ label }),
				),
			);
			expect(setDesktopEntryInstalled).toHaveBeenCalledExactlyOnceWith(
				!installed,
			);
			await vi.waitFor(() =>
				expect(toggle.getAttribute("aria-checked")).toBe(
					String(installed),
				),
			);
		},
	);
});
