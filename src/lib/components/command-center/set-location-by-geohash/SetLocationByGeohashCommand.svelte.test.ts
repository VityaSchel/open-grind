// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { fireEvent, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readMock, writeMock, writeTextMock, toastMock, showErrorToastMock } =
	vi.hoisted(() => ({
		readMock: vi.fn(),
		writeMock: vi.fn(),
		writeTextMock: vi.fn(),
		toastMock: { success: vi.fn(), error: vi.fn() },
		showErrorToastMock: vi.fn(),
	}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: readMock,
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: writeMock,
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
	writeText: writeTextMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/grid/grid-state.svelte", () => ({
	gridState: { filters: { set: vi.fn() } },
}));

import { setPreferences } from "$lib/app-data/preferences.svelte";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { commandCenterState } from "../command-center-state.svelte";
import {
	enterQuery,
	expectCommandGroup,
	openWith,
	option,
	options,
	resetCommandCenter,
	textOf,
	type,
} from "../command-center-test-helpers";

const GEOHASH = "u33dc0cpgp00";

beforeEach(async () => {
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	writeTextMock.mockReset().mockResolvedValue(undefined);
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	showErrorToastMock.mockReset();
	await setPreferences({ geohash: null });
	writeMock.mockClear();
});

afterEach(async () => {
	resetCommandCenter();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("set location by geohash command", () => {
	it("offers to copy the selected location for a bare @", async () => {
		await setPreferences({ geohash: GEOHASH });
		writeMock.mockClear();

		await openWith("@");

		expectCommandGroup({
			name: "Set location by geohash…",
			value: "set-location-by-geohash",
		});
		const copy = option("@copy");
		expect(copy?.textContent).toContain(
			`Copy currently selected location: ${GEOHASH}`,
		);
		expect(within(copy!).getByText(GEOHASH).getAttribute("translate")).toBe(
			"no",
		);
		expect(copy).toHaveProperty("dataset.selected", "");
		expect(option("@")).toBeUndefined();
	});

	it("copies the location without mutating anything", async () => {
		await setPreferences({ geohash: GEOHASH });
		writeMock.mockClear();
		await openWith("@");

		await fireEvent.click(option("@copy")!);
		await vi.waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledExactlyOnceWith(
				"Copied to clipboard",
			),
		);

		expect(writeTextMock).toHaveBeenCalledExactlyOnceWith(GEOHASH);
		expect(writeMock).not.toHaveBeenCalled();
		expect(commandCenterState.open).toBe(false);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("reports a failed copy without mutating anything", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const error = new Error("no clipboard");
		writeTextMock.mockRejectedValue(error);
		await setPreferences({ geohash: GEOHASH });
		writeMock.mockClear();
		await openWith("@");

		await fireEvent.click(option("@copy")!);
		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label: "Couldn’t copy location",
				error,
			}),
		);

		expect(toastMock.success).not.toHaveBeenCalled();
		expect(writeMock).not.toHaveBeenCalled();
	});

	it("falls back to the hint when no location is selected yet", async () => {
		await openWith("@");

		const hint = option("@");
		expect(hint?.textContent).toContain(
			"Enter the 12-character geohash to set your location",
		);
		expect(hint).toHaveProperty("ariaDisabled", "true");
		expect(option("@copy")).toBeUndefined();
	});

	it("keeps setting the location once a geohash is typed", async () => {
		await setPreferences({ geohash: GEOHASH });
		writeMock.mockClear();

		await openWith(`@${GEOHASH}`);

		expect(option("@copy")).toBeUndefined();
		const set = option(`@${GEOHASH}`);
		expect(set?.textContent).toContain(GEOHASH);
		expect(set).toHaveProperty("dataset.selected", "");
		expect(set?.getAttribute("translate")).toBe("no");
	});

	it("reports a location it couldn't save", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const error = new Error("disk full");
		await openWith(`@${GEOHASH}`);
		writeMock.mockRejectedValue(error);

		await fireEvent.click(option(`@${GEOHASH}`)!);
		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label: "Couldn’t save location",
				error,
			}),
		);

		expect(writeMock).toHaveBeenCalledOnce();
		expect(toastMock.success).not.toHaveBeenCalled();
	});

	it("drops a query longer than a geohash", async () => {
		await openWith("@u33");
		expect(options().map((item) => item.dataset.value)).toEqual(["@u33"]);

		await enterQuery(`@${GEOHASH}0`);

		await vi.waitFor(() => expect(options()).toEqual([]));
	});

	it("leaves a single item behind when the query changes", async () => {
		await setPreferences({ geohash: GEOHASH });
		writeMock.mockClear();
		await openWith("@");

		await type(`@${GEOHASH}`);
		expect(options().map((item) => item.dataset.value)).toEqual([
			`@${GEOHASH}`,
		]);

		await type("@");
		expect(options().map((item) => item.dataset.value)).toEqual(["@copy"]);
	});

	it("words the heading, hint and copy action in the active locale", async () => {
		await openWith("@");
		await setLocale({ locale: "en-XA" });

		expectCommandGroup({
			name: PSEUDO_MESSAGE,
			value: "set-location-by-geohash",
		});
		expect(textOf(option("@")!)).toMatch(PSEUDO_MESSAGE);

		await setPreferences({ geohash: GEOHASH });

		await vi.waitFor(() => expect(option("@copy")).toBeDefined());
		const copy = option("@copy")!;
		expect(textOf(copy)).toMatch(PSEUDO_MESSAGE);
		expect(within(copy).getByText(GEOHASH).getAttribute("translate")).toBe(
			"no",
		);
	});
});
