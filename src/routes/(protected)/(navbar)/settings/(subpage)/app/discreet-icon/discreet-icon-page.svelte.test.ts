// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { showErrorToast, select } = vi.hoisted(() => ({
	showErrorToast: vi.fn(),
	select: vi.fn(),
}));

vi.mock("$app/state", () => ({
	page: { url: new URL("https://app.test/settings/app/discreet-icon") },
}));
vi.mock("#lib/api/error-toast.ts", () => ({ showErrorToast }));
vi.mock("#lib/platform/os.ts", () => ({ currentPlatform: () => "linux" }));
vi.mock("#lib/platform/disguise.svelte.ts", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("#lib/platform/disguise.svelte.ts")
	>()),
	currentDisguise: () => "original",
	disguisePresets: () => [{ id: "papizza", name: "Papizza" }],
	disguiseRenameNeedsAdmin: () => false,
	selectDisguise: select,
}));

import DiscreetIconPage from "./+page.svelte";

afterEach(() => {
	cleanup();
	showErrorToast.mockReset();
	select.mockReset();
});

async function chooseAndFailWith(error: unknown): Promise<string> {
	select.mockRejectedValue(error);
	render(DiscreetIconPage, {
		props: { data: { ourProfileId: 1, previews: {} }, params: {} },
	});

	await fireEvent.click(screen.getByRole("button", { name: "Papizza" }));

	await vi.waitFor(() => expect(showErrorToast).toHaveBeenCalledOnce());
	const [{ label, error: shown }] = showErrorToast.mock.lastCall as [
		{ label: string; error: unknown },
	];
	expect(shown).toBe(error);
	return label;
}

describe("the discreet app icon page", () => {
	it("names the app that already holds the chosen name", async () => {
		expect(await chooseAndFailWith({ reason: "nameTaken" })).toBe(
			"An app named Papizza is already in this folder",
		);
	});

	it("says the icon changed when only renaming needs an administrator", async () => {
		expect(await chooseAndFailWith({ reason: "renameNeedsAdmin" })).toBe(
			"The icon changed, but renaming the app needs an administrator account",
		);
	});

	it.each([
		{ reason: "failed", detail: "macOS refused to change the app icon" },
		"unknown disguise papizza",
	])("keeps the general message for %j", async (error) => {
		expect(await chooseAndFailWith(error)).toBe(
			"Couldn’t change the app icon",
		);
	});
});

describe("choosing an icon from the keyboard", () => {
	it("keeps focus on the chosen icon while it applies", async () => {
		const applying = Promise.withResolvers<void>();
		select.mockReturnValue(applying.promise);
		render(DiscreetIconPage, {
			props: { data: { ourProfileId: 1, previews: {} }, params: {} },
		});
		const papizza = screen.getByRole("button", { name: "Papizza" });
		papizza.focus();

		await fireEvent.click(papizza, { detail: 0 });
		await fireEvent.click(papizza, { detail: 0 });

		expect(select).toHaveBeenCalledOnce();
		expect(document.activeElement).toBe(papizza);
		for (const choice of screen.getAllByRole("button")) {
			expect(choice.getAttribute("aria-disabled")).toBe("true");
			expect(choice.hasAttribute("disabled")).toBe(false);
		}
		applying.resolve();
		await vi.waitFor(() =>
			expect(papizza.getAttribute("aria-disabled")).toBe("false"),
		);
	});
});
