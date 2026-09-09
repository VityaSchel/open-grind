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
import type { BackdropBlurQuality } from "$lib/blur/quality";
import BackdropBlurSetting from "./BackdropBlurSetting.svelte";

function slider() {
	return screen.getByRole("slider", { name: "Background blur" });
}

async function storedQuality(backdropBlurQuality: BackdropBlurQuality | null) {
	await setPreferences({
		backdropBlurQuality,
		backdropBlurCalibration: null,
	});
	writeMock.mockClear();
}

beforeEach(async () => {
	vi.restoreAllMocks();
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	showErrorToastMock.mockReset();
	await storedQuality(null);
});

afterEach(cleanup);

describe("BackdropBlurSetting", () => {
	it("shows the effective quality and names it for screen readers", async () => {
		await storedQuality("min");
		render(BackdropBlurSetting);
		expect(slider().getAttribute("aria-valuetext")).toBe("Low");
		expect(slider().getAttribute("aria-valuenow")).toBe("1");
	});

	it("says the trial is still running when nothing is stored", () => {
		render(BackdropBlurSetting);
		expect(
			screen.getByText("Being chosen automatically as you scroll."),
		).toBeTruthy();
	});

	it("says the device decided once the trial settles", async () => {
		await setPreferences({
			backdropBlurQuality: null,
			backdropBlurCalibration: { quality: "medium", samples: [] },
		});
		render(BackdropBlurSetting);
		expect(
			screen.getByText("Chosen automatically for this device."),
		).toBeTruthy();
		expect(slider().getAttribute("aria-valuetext")).toBe("Medium");
	});

	it("stops saying that once the user picks a quality", async () => {
		await storedQuality("medium");
		render(BackdropBlurSetting);
		expect(
			screen.queryByText("Being chosen automatically as you scroll."),
		).toBeNull();
		expect(
			screen.queryByText("Chosen automatically for this device."),
		).toBeNull();
	});

	it("saves the quality the slider moves to", async () => {
		await storedQuality("max");
		render(BackdropBlurSetting);
		await fireEvent.keyDown(slider(), { key: "ArrowLeft" });

		expect(slider().getAttribute("aria-valuetext")).toBe("Medium");
		expect(writeMock).toHaveBeenCalled();
	});

	it("rolls back and reports a failed save", async () => {
		await storedQuality("max");
		writeMock.mockRejectedValueOnce(new Error("disk full"));
		render(BackdropBlurSetting);
		await fireEvent.keyDown(slider(), { key: "ArrowLeft" });
		await vi.waitFor(() => expect(showErrorToastMock).toHaveBeenCalled());

		expect(slider().getAttribute("aria-valuetext")).toBe("Full");
	});

	it("pins to off and explains itself when the engine cannot blur", async () => {
		vi.spyOn(CSS, "supports").mockImplementation(() => false);
		await storedQuality("max");
		render(BackdropBlurSetting);

		expect(slider().getAttribute("aria-valuetext")).toBe("Off");
		expect(slider().getAttribute("aria-disabled")).toBe("true");
		expect(
			screen.getByText(
				"This system cannot blur backgrounds, so blur is always off.",
			),
		).toBeTruthy();
	});
});
