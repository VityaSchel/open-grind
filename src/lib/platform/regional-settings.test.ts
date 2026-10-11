import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, listenMock, tauri } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	listenMock: vi.fn(),
	tauri: { enabled: false },
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
	isTauri: () => tauri.enabled,
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

import { getRegionalSettings, setRegionalSettings } from "$lib/i18n";
import { webRegionalSettings } from "$lib/i18n/regional";
import {
	NATIVE_READ_TIMEOUT_MS,
	startRegionalSettings,
} from "$lib/platform/regional-settings";

type ChangeHandler = (event: { payload: unknown }) => void;

function changeLanguage(language: string): void {
	vi.spyOn(navigator, "language", "get").mockReturnValue(language);
	window.dispatchEvent(new Event("languagechange"));
}

function emitChange(payload: unknown): void {
	const [[event, handler]] = listenMock.mock.calls as [
		[string, ChangeHandler],
	];
	expect(event).toBe("regional-settings-changed");
	handler({ payload });
}

beforeEach(() => {
	invokeMock.mockReset();
	listenMock.mockReset().mockResolvedValue(() => {});
	tauri.enabled = false;
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	history.replaceState(null, "", "/");
	setRegionalSettings(webRegionalSettings());
});

describe("startRegionalSettings in a browser", () => {
	it("pins a dev ?regional= tag and ignores the browser's language", async () => {
		history.replaceState(null, "", "/chat?regional=de-DE-u-hc-h12");

		await startRegionalSettings();
		changeLanguage("fr-FR");

		expect(getRegionalSettings()).toEqual({
			locale: "de-DE-u-hc-h12",
			hourCycle: "h12",
		});
	});

	it("pins a dev ?regional= snapshot", async () => {
		history.replaceState(
			null,
			"",
			`/?regional=${encodeURIComponent('{"locale":"en-US","measurementSystem":"us"}')}`,
		);

		await startRegionalSettings();

		expect(getRegionalSettings()).toEqual({
			locale: "en-US",
			measurementSystem: "us",
		});
	});

	it("follows the browser's language without an override", async () => {
		history.replaceState(null, "", "/?regional=%%%");
		setRegionalSettings({ locale: "ja-JP" });

		await startRegionalSettings();
		expect(getRegionalSettings()).toEqual({ locale: navigator.language });

		changeLanguage("de-AT");
		expect(getRegionalSettings()).toEqual({ locale: "de-AT" });
		expect(invokeMock).not.toHaveBeenCalled();
	});
});

describe("startRegionalSettings in the app", () => {
	beforeEach(() => {
		tauri.enabled = true;
	});

	it("reads the system's settings, dropping fields it cannot read", async () => {
		invokeMock.mockResolvedValue({
			locale: "de-DE",
			hourCycle: "h12",
			firstDayOfWeek: 1,
			measurementSystem: "imperial",
		});

		await startRegionalSettings();

		expect(invokeMock).toHaveBeenCalledWith("regional_settings");
		expect(getRegionalSettings()).toEqual({
			locale: "de-DE",
			hourCycle: "h12",
			firstDayOfWeek: 1,
		});
	});

	it.each([
		["an unreadable answer", () => invokeMock.mockResolvedValue(null)],
		["a failed read", () => invokeMock.mockRejectedValue(new Error("no"))],
	])("keeps the browser's settings after %s", async (_, answer) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		answer();

		await startRegionalSettings();

		expect(getRegionalSettings()).toEqual(webRegionalSettings());
	});

	it("stops waiting for a slow read but still applies it", async () => {
		vi.useFakeTimers();
		let answer: (value: unknown) => void = () => {};
		invokeMock.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			}),
		);

		const started = startRegionalSettings();
		await vi.advanceTimersByTimeAsync(NATIVE_READ_TIMEOUT_MS);
		await started;
		expect(getRegionalSettings()).toEqual(webRegionalSettings());

		answer({ locale: "de-DE" });
		await vi.waitFor(() =>
			expect(getRegionalSettings()).toEqual({ locale: "de-DE" }),
		);
	});

	it("lets a dev ?regional= override win over the system", async () => {
		history.replaceState(null, "", "/?regional=ja-JP");

		await startRegionalSettings();

		expect(invokeMock).not.toHaveBeenCalled();
		expect(listenMock).not.toHaveBeenCalled();
		expect(getRegionalSettings()).toEqual({ locale: "ja-JP" });
	});

	it("follows change events and skips ones it cannot read", async () => {
		invokeMock.mockResolvedValue({ locale: "de-DE" });
		await startRegionalSettings();

		emitChange({ locale: "de-DE", hourCycle: "h12" });
		expect(getRegionalSettings()).toEqual({
			locale: "de-DE",
			hourCycle: "h12",
		});

		emitChange({ hourCycle: "h23" });
		expect(getRegionalSettings()).toEqual({
			locale: "de-DE",
			hourCycle: "h12",
		});
	});

	it("keeps a change that arrives before a slow first read", async () => {
		vi.useFakeTimers();
		let answer: (value: unknown) => void = () => {};
		invokeMock.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			}),
		);
		const started = startRegionalSettings();

		emitChange({ locale: "fr-FR" });
		answer({ locale: "de-DE" });
		await vi.advanceTimersByTimeAsync(NATIVE_READ_TIMEOUT_MS);
		await started;

		expect(getRegionalSettings()).toEqual({ locale: "fr-FR" });
	});
});
