// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readMock, writeMock, showErrorToastMock } = vi.hoisted(() => ({
	readMock: vi.fn(),
	writeMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: readMock,
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: writeMock,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));

import { setPreferences } from "$lib/app-data/preferences.svelte";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import UnitsSetting from "./UnitsSetting.svelte";

beforeEach(async () => {
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	showErrorToastMock.mockReset();
	await setPreferences({ units: "metric" });
	writeMock.mockClear();
});

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("UnitsSetting", () => {
	it("words its title, description and options in the active locale", async () => {
		render(UnitsSetting);
		const copy = [
			screen.getByText("Units"),
			screen.getByText(
				"Choose how distance, height, and weight are displayed.",
			),
			screen.getByRole("radio", { name: "Metric" }),
			screen.getByRole("radio", { name: "Imperial" }),
		];

		await setLocale({ locale: "en-XA" });

		for (const element of copy) {
			expect(element.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		}
	});

	it("turns back and says so when the units can’t be saved", async () => {
		writeMock.mockRejectedValueOnce(new Error("disk full"));
		render(UnitsSetting);

		await fireEvent.click(screen.getByRole("radio", { name: "Imperial" }));

		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({ label: "Couldn’t save setting" }),
			),
		);
		expect(
			screen
				.getByRole("radio", { name: "Metric" })
				.getAttribute("aria-checked"),
		).toBe("true");
	});
});
