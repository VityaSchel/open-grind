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
import RevealMessageReadSetting from "./RevealMessageReadSetting.svelte";

function toggle() {
	return screen.getByRole("switch");
}

async function storedPreference(revealMessageRead: boolean) {
	await setPreferences({ revealMessageRead });
	writeMock.mockClear();
	readMock.mockClear();
}

beforeEach(async () => {
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	showErrorToastMock.mockReset();
	await storedPreference(false);
});

afterEach(cleanup);

describe("RevealMessageReadSetting", () => {
	it("renders the stored preference without loading it itself", async () => {
		await storedPreference(true);

		render(RevealMessageReadSetting);

		expect(toggle().getAttribute("aria-checked")).toBe("true");
		expect(toggle().hasAttribute("disabled")).toBe(false);
		expect(readMock).not.toHaveBeenCalled();
	});

	it("keeps the new value when the write succeeds", async () => {
		render(RevealMessageReadSetting);

		await fireEvent.click(toggle());

		expect(writeMock).toHaveBeenCalledOnce();
		expect(toggle().getAttribute("aria-checked")).toBe("true");
	});

	it("rolls back to the stored preference when the write fails", async () => {
		render(RevealMessageReadSetting);
		writeMock.mockRejectedValue(new Error("disk full"));

		await fireEvent.click(toggle());
		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledOnce(),
		);

		expect(toggle().getAttribute("aria-checked")).toBe("false");
	});
});
