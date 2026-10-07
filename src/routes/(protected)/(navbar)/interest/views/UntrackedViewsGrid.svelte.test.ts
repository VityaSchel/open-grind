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
			" Profile viewers aren't tracked Your profile viewers are not being recorded, because you have toggled Viewed Me List off in the official app. Press the button below to enable this feature and update this setting in the official client. Enable",
		);
		expect(enableButton().textContent).toBe("Enable");
	});

	it("turns tracking on when Enable is pressed", async () => {
		const { onEnable } = renderUntracked();
		expect(onEnable).not.toHaveBeenCalled();

		await fireEvent.click(enableButton());

		expect(onEnable).toHaveBeenCalledOnce();
	});

	it("disables Enable while tracking is being turned on", async () => {
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
