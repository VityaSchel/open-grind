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

const { reportLocationFailure, showLocationPermissionToast } =
	await import("./location-feedback");

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

describe("reportLocationFailure", () => {
	beforeEach(() => {
		canOpenAppSettingsMock.mockReturnValue(true);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("explains a denial by what is missing", () => {
		reportLocationFailure({ status: "denied", ...PRECISION_MISSING });

		expect(toastMock.error.mock.calls.at(-1)?.[0]).toMatch(
			/^Precise Location is off\./,
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});
});
