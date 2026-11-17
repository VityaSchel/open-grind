import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";

const {
	canOpenAppSettingsMock,
	openAppSettingsMock,
	showErrorToastMock,
	toastMock,
} = vi.hoisted(() => ({
	canOpenAppSettingsMock: vi.fn(),
	openAppSettingsMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	toastMock: { error: vi.fn() },
}));

vi.mock("#lib/platform/app-settings.ts", () => ({
	canOpenAppSettings: canOpenAppSettingsMock,
	openAppSettings: openAppSettingsMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));

const { reportLocationFailure } = await import("./location-feedback");

const PERMISSION_MISSING = { status: "denied", missing: "permission" } as const;
const PRECISION_MISSING = { status: "denied", missing: "precision" } as const;

function optionsOfLastToast() {
	return toastMock.error.mock.calls.at(-1)?.[1] as {
		id?: string;
		action?: { label: string; onClick: () => void };
	};
}

describe("reportLocationFailure for a denial", () => {
	beforeEach(() => {
		canOpenAppSettingsMock.mockReturnValue(true);
	});

	afterEach(async () => {
		vi.resetAllMocks();
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("offers a shortcut into the system settings", () => {
		reportLocationFailure(PERMISSION_MISSING);

		const options = optionsOfLastToast();
		expect(options.action?.label).toBe("Settings");
		options.action?.onClick();
		expect(openAppSettingsMock).toHaveBeenCalledTimes(1);
	});

	it("words the toast and its shortcut in the active locale", async () => {
		await setLocale({ locale: "en-XA" });
		reportLocationFailure(PERMISSION_MISSING);

		expect(toastMock.error.mock.calls.at(-1)?.[0]).toMatch(PSEUDO_MESSAGE);
		expect(optionsOfLastToast().action?.label).toMatch(PSEUDO_MESSAGE);
	});

	it("omits the shortcut where settings cannot be opened", () => {
		canOpenAppSettingsMock.mockReturnValue(false);
		reportLocationFailure(PERMISSION_MISSING);
		expect(optionsOfLastToast().action).toBeUndefined();
	});

	it("reuses one toast id so repeats never stack", () => {
		reportLocationFailure(PERMISSION_MISSING);
		reportLocationFailure(PRECISION_MISSING);
		const ids = toastMock.error.mock.calls.map(
			(call) => (call[1] as { id?: string }).id,
		);
		expect(ids[0]).toBeDefined();
		expect(new Set(ids).size).toBe(1);
	});

	it("asks for Precise Location when only precision is missing", () => {
		reportLocationFailure(PRECISION_MISSING);

		expect(toastMock.error.mock.calls.at(-1)?.[0]).toBe(
			"Precise Location is off. Turn it on in your system settings to use GPS.",
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
		optionsOfLastToast().action?.onClick();
		expect(openAppSettingsMock).toHaveBeenCalledTimes(1);
	});
});

describe("reportLocationFailure for an error", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetAllMocks();
	});

	it("tells the user to turn Location Services on instead of a generic failure", () => {
		reportLocationFailure({
			status: "error",
			error: "[disabled] - Location services are not enabled.",
			reason: "disabled",
		});

		expect(toastMock.error.mock.calls.at(-1)?.[0]).toBe(
			"Location Services are off or restricted. Turn them on in your system settings to use GPS.",
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("keeps the generic failure toast, under the caller's label, for a fix that never came", () => {
		const error = "[timeout] - Timed out waiting for a location fix.";
		reportLocationFailure(
			{ status: "error", error, reason: "failed" },
			{ label: "Failed to update your location automatically" },
		);

		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to update your location automatically",
			error,
		});
		expect(toastMock.error).not.toHaveBeenCalled();
	});
});
