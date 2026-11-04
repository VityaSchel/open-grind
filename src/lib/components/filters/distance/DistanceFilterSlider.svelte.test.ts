// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	preferencesSnapshot: () => ({ units: "metric" }),
}));

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import DistanceFilterSlider from "./DistanceFilterSlider.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("DistanceFilterSlider", () => {
	it("names its thumb in the active locale", async () => {
		render(DistanceFilterSlider, { props: { value: 10 } });
		const thumb = screen.getByRole("slider", { name: "Maximum Distance" });

		await setLocale({ locale: "en-XA" });

		expect(screen.getByRole("slider", { name: PSEUDO_MESSAGE })).toBe(
			thumb,
		);
	});
});
