// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
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
import { commandCenterState } from "../command-center-state.svelte";
import CommandCenter from "../CommandCenter.svelte";

const GEOHASH = "u33dc0cpgp00";

Element.prototype.scrollIntoView = () => {};

function options(): HTMLElement[] {
	return screen.queryAllByRole("option");
}

function option(value: string): HTMLElement | undefined {
	return options().find((item) => item.dataset.value === value);
}

async function type(query: string) {
	await fireEvent.input(screen.getByRole("combobox"), {
		target: { value: query },
	});
	await vi.waitFor(() => expect(options().length).toBeGreaterThan(0));
}

async function openWith(query: string) {
	commandCenterState.open = true;
	render(CommandCenter);
	await type(query);
}

beforeEach(async () => {
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	writeTextMock.mockReset().mockResolvedValue(undefined);
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	showErrorToastMock.mockReset();
	await setPreferences({ geohash: null });
	writeMock.mockClear();
	commandCenterState.query = "";
	commandCenterState.value = "";
});

afterEach(() => {
	cleanup();
	commandCenterState.open = false;
});

describe("set location by geohash command", () => {
	it("offers to copy the selected location for a bare @", async () => {
		await setPreferences({ geohash: GEOHASH });
		writeMock.mockClear();

		await openWith("@");

		const copy = option("@copy");
		expect(copy?.textContent).toContain(
			`Copy currently selected location: ${GEOHASH}`,
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
				"Location copied to clipboard",
			),
		);

		expect(writeTextMock).toHaveBeenCalledExactlyOnceWith(GEOHASH);
		expect(writeMock).not.toHaveBeenCalled();
		expect(commandCenterState.open).toBe(false);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("reports a failed copy without mutating anything", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		writeTextMock.mockRejectedValue(new Error("no clipboard"));
		await setPreferences({ geohash: GEOHASH });
		writeMock.mockClear();
		await openWith("@");

		await fireEvent.click(option("@copy")!);
		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledOnce(),
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
});
