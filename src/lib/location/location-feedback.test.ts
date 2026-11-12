import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const {
	reportLocationFailure,
	showLocationErrorToast,
	showLocationPermissionToast,
} = await import("./location-feedback");

const PERMISSION_MISSING = { missing: "permission" } as const;
const PRECISION_MISSING = { missing: "precision" } as const;

function optionsOfLastToast() {
	return toastMock.error.mock.calls.at(-1)?.[1] as {
		id?: string;
		action?: { label: string; onClick: () => void };
	};
}

describe("showLocationPermissionToast", () => {
	beforeEach(() => {
		canOpenAppSettingsMock.mockReturnValue(true);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("offers a shortcut into the system settings", () => {
		showLocationPermissionToast(PERMISSION_MISSING);

		const options = optionsOfLastToast();
		expect(options.action?.label).toBe("Settings");
		options.action?.onClick();
		expect(openAppSettingsMock).toHaveBeenCalledTimes(1);
	});

	it("omits the shortcut where settings cannot be opened", () => {
		canOpenAppSettingsMock.mockReturnValue(false);
		showLocationPermissionToast(PERMISSION_MISSING);
		expect(optionsOfLastToast().action).toBeUndefined();
	});

	it("reuses one toast id so repeats never stack", () => {
		showLocationPermissionToast(PERMISSION_MISSING);
		showLocationPermissionToast(PRECISION_MISSING);
		const ids = toastMock.error.mock.calls.map(
			(call) => (call[1] as { id?: string }).id,
		);
		expect(ids[0]).toBeDefined();
		expect(new Set(ids).size).toBe(1);
	});

	it("asks for Precise Location when only precision is missing", () => {
		showLocationPermissionToast(PRECISION_MISSING);

		expect(toastMock.error.mock.calls.at(-1)?.[0]).toBe(
			"Precise Location is off. Turn it on in your system settings to use GPS.",
		);
		optionsOfLastToast().action?.onClick();
		expect(openAppSettingsMock).toHaveBeenCalledTimes(1);
	});
});

describe("showLocationErrorToast", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it("tells the user to turn Location Services on instead of a generic failure", () => {
		showLocationErrorToast({
			label: "Failed to get current location",
			error: "[disabled] - Location services are not enabled.",
			reason: "disabled",
		});

		expect(toastMock.error.mock.calls.at(-1)?.[0]).toBe(
			"Location Services are off or restricted. Turn them on in your system settings to use GPS.",
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("keeps the generic failure toast for a fix that never came", () => {
		const error = "[timeout] - Timed out waiting for a location fix.";
		showLocationErrorToast({
			label: "Failed to get current location",
			error,
			reason: "timeout",
		});

		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to get current location",
			error,
		});
		expect(toastMock.error).not.toHaveBeenCalled();
	});
});

describe("reportLocationFailure", () => {
	beforeEach(() => {
		canOpenAppSettingsMock.mockReturnValue(true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetAllMocks();
	});

	it("explains a denial by what is missing", () => {
		reportLocationFailure({ status: "denied", ...PRECISION_MISSING });

		expect(toastMock.error.mock.calls.at(-1)?.[0]).toMatch(
			/^Precise Location is off\./,
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("explains Location Services being off by name", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		reportLocationFailure({
			status: "error",
			error: "[disabled] - Location access is restricted.",
			reason: "disabled",
		});

		expect(toastMock.error.mock.calls.at(-1)?.[0]).toMatch(
			/^Location Services are off or restricted\./,
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});
});
