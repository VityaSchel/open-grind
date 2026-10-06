// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { showErrorToast, setPreferences, setDesktopEntryInstalled } = vi.hoisted(
	() => ({
		showErrorToast: vi.fn<(options: { label?: string }) => void>(),
		setPreferences: vi.fn(),
		setDesktopEntryInstalled: vi.fn(),
	}),
);

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast }));
vi.mock("$lib/app-data/preferences.svelte", () => ({ setPreferences }));
vi.mock("$lib/updates/capability.svelte", () => ({
	updatesSelfManaged: () => true,
}));
vi.mock("$lib/updates/update-settings.svelte", () => ({
	saveAutomaticChecks: () => Promise.resolve(),
}));
vi.mock("$lib/platform/desktop-entry.svelte", () => ({
	desktopEntryAvailable: () => true,
	desktopEntryInstalled: () => false,
	setDesktopEntryInstalled,
}));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import OnboardingPage from "./+page.svelte";

beforeEach(() => {
	setPreferences.mockResolvedValue(undefined);
	setDesktopEntryInstalled.mockResolvedValue(undefined);
});

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

function startButton() {
	return screen.getByRole("button", { name: "Get started" });
}

describe("Onboarding page", () => {
	it("introduces the app and its setup choices", () => {
		const { container } = render(OnboardingPage);

		expect(document.title).toBe("Welcome");
		expect(
			[...container.querySelectorAll("h1, p, label, button")].map(
				(node) => node.textContent.replaceAll(/\s+/g, " ").trim(),
			),
		).toEqual([
			"Open Grind",
			"Unofficial Grindr client",
			"Cross-platform, free, libre, ad-free, tracker-free, privacy-centered and community-driven",
			"Check updates automatically",
			"",
			"Add Open Grind to your apps menu",
			"",
			"Get started",
		]);
	});

	it("names a failed apps menu entry", async () => {
		setDesktopEntryInstalled.mockRejectedValue(new Error("denied"));
		render(OnboardingPage);

		await fireEvent.click(startButton());

		await vi.waitFor(() =>
			expect(showErrorToast).toHaveBeenCalledWith(
				expect.objectContaining({
					label: "Couldn't add Open Grind to your apps",
				}),
			),
		);
	});

	it("names a failed setup", async () => {
		setPreferences.mockRejectedValue(new Error("disk full"));
		render(OnboardingPage);

		await fireEvent.click(startButton());

		await vi.waitFor(() =>
			expect(showErrorToast).toHaveBeenCalledWith(
				expect.objectContaining({ label: "Couldn't finish setup" }),
			),
		);
	});

	it("renders its copy in the active locale and keeps the app name", async () => {
		setPreferences.mockRejectedValue(new Error("disk full"));
		const { container } = render(OnboardingPage);
		const start = startButton();
		await setLocale({ locale: "en-XA" });

		const heading = screen.getByRole("heading", { level: 1 });
		const lines = [...container.querySelectorAll("p, label, button")]
			.map((node) => node.textContent.trim())
			.filter((line) => line !== "");
		expect(heading.textContent.trim()).toBe("Open Grind");
		expect(document.title).toMatch(PSEUDO_MESSAGE);
		expect(lines).toHaveLength(5);
		for (const line of lines) expect(line).toMatch(PSEUDO_MESSAGE);

		await fireEvent.click(start);
		await vi.waitFor(() =>
			expect(showErrorToast.mock.lastCall?.[0].label).toMatch(
				PSEUDO_MESSAGE,
			),
		);
	});
});
