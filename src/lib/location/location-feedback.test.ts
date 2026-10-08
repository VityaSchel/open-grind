import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";

const { canOpenAppSettingsMock, openAppSettingsMock, toastMock } = vi.hoisted(
	() => ({
		canOpenAppSettingsMock: vi.fn(),
		openAppSettingsMock: vi.fn(),
		toastMock: { error: vi.fn() },
	}),
);

vi.mock("$lib/platform/app-settings", () => ({
	canOpenAppSettings: canOpenAppSettingsMock,
	openAppSettings: openAppSettingsMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

const { showLocationPermissionToast } = await import("./location-feedback");

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

	afterEach(async () => {
		vi.resetAllMocks();
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("offers a shortcut into the system settings", () => {
		showLocationPermissionToast();

		const options = optionsOfLastToast();
		expect(options.action?.label).toBe("Settings");
		options.action?.onClick();
		expect(openAppSettingsMock).toHaveBeenCalledTimes(1);
	});

	it("words the toast and its shortcut in the active locale", async () => {
		await setLocale({ locale: "en-XA" });
		showLocationPermissionToast();

		expect(toastMock.error.mock.calls.at(-1)?.[0]).toMatch(PSEUDO_MESSAGE);
		expect(optionsOfLastToast().action?.label).toMatch(PSEUDO_MESSAGE);
	});

	it("omits the shortcut where settings cannot be opened", () => {
		canOpenAppSettingsMock.mockReturnValue(false);
		showLocationPermissionToast();
		expect(optionsOfLastToast().action).toBeUndefined();
	});

	it("reuses one toast id so repeats never stack", () => {
		showLocationPermissionToast();
		showLocationPermissionToast();
		const ids = toastMock.error.mock.calls.map(
			(call) => (call[1] as { id?: string }).id,
		);
		expect(ids[0]).toBeDefined();
		expect(new Set(ids).size).toBe(1);
	});
});
