// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import SaveChangesBar from "./SaveChangesBar.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("SaveChangesBar", () => {
	it("offers to save changes, also while saving", async () => {
		const view = render(SaveChangesBar, {
			props: { saving: false, onclick: vi.fn() },
		});
		const button = screen.getByRole<HTMLButtonElement>("button", {
			name: "Save changes",
		});
		expect(button.disabled).toBe(false);

		await view.rerender({ saving: true });

		expect(button.disabled).toBe(true);
		expect(button.textContent.trim()).toBe("Save changes");
	});

	it("renames the button when the locale changes", async () => {
		render(SaveChangesBar, { props: { saving: false, onclick: vi.fn() } });

		await setLocale({ locale: "en-XA" });

		const button = screen.getByRole("button");
		await vi.waitFor(() =>
			expect(button.textContent.trim()).toBe(
				t("shell.saveChangesBar.save"),
			),
		);
		expect(button.textContent.trim()).toMatch(PSEUDO_MESSAGE);
	});
});
