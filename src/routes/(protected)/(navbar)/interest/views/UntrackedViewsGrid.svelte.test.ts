// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import UntrackedViewsGrid from "./UntrackedViewsGrid.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

function renderUntracked({ enabling = false } = {}) {
	const onEnable = vi.fn();
	const view = render(UntrackedViewsGrid, { props: { enabling, onEnable } });
	return { ...view, onEnable };
}

function enableButton(): HTMLButtonElement {
	return screen.getByRole<HTMLButtonElement>("button");
}

describe("UntrackedViewsGrid", () => {
	it("explains that the official app stopped recording viewers", () => {
		const { container } = renderUntracked();

		expect(container.textContent).toBe(
			" Viewed Me is off Grindr isn’t recording who views your profile because “Show Me In Viewed Me List” is off in your Grindr settings. Turning it on changes it in the official Grindr app too, and lets people see when you view their profiles. Turn on",
		);
		expect(enableButton().textContent).toBe("Turn on");
	});

	it("turns tracking on when Turn on is pressed", async () => {
		const { onEnable } = renderUntracked();
		expect(onEnable).not.toHaveBeenCalled();

		await fireEvent.click(enableButton());

		expect(onEnable).toHaveBeenCalledOnce();
	});

	it("disables Turn on while tracking is being turned on", async () => {
		const { rerender } = renderUntracked({ enabling: true });

		expect(enableButton().disabled).toBe(true);

		await rerender({ enabling: false });

		expect(enableButton().disabled).toBe(false);
	});

	it("words the prompt and its button in the active locale", async () => {
		const { container } = renderUntracked();

		await setLocale({ locale: "en-XA" });

		const lines = [
			...container.querySelectorAll(
				'[data-slot="empty-title"], [data-slot="empty-description"]',
			),
			enableButton(),
		].map((line) => line.textContent);
		expect(lines).toHaveLength(3);
		for (const line of lines) expect(line).toMatch(PSEUDO_MESSAGE);
	});
});
