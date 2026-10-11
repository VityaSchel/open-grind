import { afterEach, describe, expect, it, vi } from "vitest";

import { getRegionalSettings, setRegionalSettings } from "$lib/i18n";
import { webRegionalSettings } from "$lib/i18n/regional";
import { startRegionalSettings } from "$lib/platform/regional-settings";

function changeLanguage(language: string): void {
	vi.spyOn(navigator, "language", "get").mockReturnValue(language);
	window.dispatchEvent(new Event("languagechange"));
}

afterEach(() => {
	vi.restoreAllMocks();
	history.replaceState(null, "", "/");
	setRegionalSettings(webRegionalSettings());
});

describe("startRegionalSettings", () => {
	it("pins a dev ?regional= tag and ignores the browser's language", () => {
		history.replaceState(null, "", "/chat?regional=de-DE-u-hc-h12");

		startRegionalSettings();
		changeLanguage("fr-FR");

		expect(getRegionalSettings()).toEqual({
			locale: "de-DE-u-hc-h12",
			hourCycle: "h12",
		});
	});

	it("pins a dev ?regional= snapshot", () => {
		history.replaceState(
			null,
			"",
			`/?regional=${encodeURIComponent('{"locale":"en-US","measurementSystem":"us"}')}`,
		);

		startRegionalSettings();

		expect(getRegionalSettings()).toEqual({
			locale: "en-US",
			measurementSystem: "us",
		});
	});

	it("follows the browser's language without an override", () => {
		history.replaceState(null, "", "/?regional=%%%");
		setRegionalSettings({ locale: "ja-JP" });

		startRegionalSettings();
		expect(getRegionalSettings()).toEqual({ locale: navigator.language });

		changeLanguage("de-AT");
		expect(getRegionalSettings()).toEqual({ locale: "de-AT" });
	});
});
