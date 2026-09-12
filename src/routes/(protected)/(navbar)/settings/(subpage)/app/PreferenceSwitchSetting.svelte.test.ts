// @vitest-environment jsdom

import { decode, encode } from "@msgpack/msgpack";
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

import {
	type BooleanPreference,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import PreferenceSwitchSetting from "./PreferenceSwitchSetting.svelte";

function toggle() {
	return screen.getByRole("switch");
}

function lastWritten(): Record<string, unknown> {
	const { content } = writeMock.mock.lastCall?.[0] as { content: Uint8Array };
	return decode(content) as Record<string, unknown>;
}

describe.each<BooleanPreference>([
	"hapticFeedback",
	"stayOnline",
	"revealMessageRead",
	"revealProfileViews",
])("PreferenceSwitchSetting for %s", (preference) => {
	async function storedPreference(value: boolean) {
		await setPreferences({ [preference]: value });
		writeMock.mockClear();
		readMock.mockClear();
	}

	function renderSetting() {
		render(PreferenceSwitchSetting, {
			preference,
			title: "Title",
			description: "Description",
		});
	}

	beforeEach(async () => {
		readMock.mockReset().mockResolvedValue(encode({}));
		writeMock.mockReset().mockResolvedValue(undefined);
		showErrorToastMock.mockReset();
		await storedPreference(true);
	});

	afterEach(cleanup);

	it("renders the stored preference without loading it itself", async () => {
		await storedPreference(false);

		renderSetting();

		expect(toggle().getAttribute("aria-checked")).toBe("false");
		expect(toggle().hasAttribute("disabled")).toBe(false);
		expect(readMock).not.toHaveBeenCalled();
	});

	it("writes its own preference and keeps the new value", async () => {
		renderSetting();

		await fireEvent.click(toggle());

		expect(writeMock).toHaveBeenCalledOnce();
		expect(lastWritten()[preference]).toBe(false);
		expect(toggle().getAttribute("aria-checked")).toBe("false");
	});

	it("rolls back to the stored preference when the write fails", async () => {
		renderSetting();
		writeMock.mockRejectedValue(new Error("disk full"));

		await fireEvent.click(toggle());
		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledOnce(),
		);

		expect(toggle().getAttribute("aria-checked")).toBe("true");
	});
});
