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
import StayOnlineSetting from "./StayOnlineSetting.svelte";

function toggle() {
	return screen.getByRole("switch");
}

async function storedPreference(stayOnline: boolean) {
	await setPreferences({ stayOnline });
	writeMock.mockClear();
	readMock.mockClear();
}

beforeEach(async () => {
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	showErrorToastMock.mockReset();
	await storedPreference(true);
});

afterEach(cleanup);

describe("StayOnlineSetting", () => {
	it("renders the stored preference without loading it itself", async () => {
		await storedPreference(false);

		render(StayOnlineSetting);

		expect(toggle().getAttribute("aria-checked")).toBe("false");
		expect(toggle().hasAttribute("disabled")).toBe(false);
		expect(readMock).not.toHaveBeenCalled();
	});

	it("keeps the new value when the write succeeds", async () => {
		render(StayOnlineSetting);

		await fireEvent.click(toggle());

		expect(writeMock).toHaveBeenCalledOnce();
		expect(toggle().getAttribute("aria-checked")).toBe("false");
	});

	it("rolls back to the stored preference when the write fails", async () => {
		render(StayOnlineSetting);
		writeMock.mockRejectedValue(new Error("disk full"));

		await fireEvent.click(toggle());
		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledOnce(),
		);

		expect(toggle().getAttribute("aria-checked")).toBe("true");
	});
});
