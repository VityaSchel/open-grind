import { beforeEach, describe, expect, it, vi } from "vitest";

const toasts = vi.hoisted(() => ({
	dismissStage: vi.fn(),
	showAddonInstalled: vi.fn(),
	showInstalled: vi.fn(),
	showManualInstall: vi.fn(),
	showProblem: vi.fn<(problem: { title: string; body?: string }) => void>(),
	showStage: vi.fn(),
	showUpToDate: vi.fn(),
}));

vi.mock("./toasts", () => toasts);

import { toastPresenter } from "./toast-presenter";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("a Google OAuth app problem toast", () => {
	it("does not repeat the Google OAuth app under a title that names it", () => {
		toastPresenter("google-oauth").problem(
			"Couldn't install the Google OAuth app",
		);

		expect(toasts.showProblem.mock.calls).toEqual([
			[
				{
					title: "Couldn't install the Google OAuth app",
					body: undefined,
				},
			],
		]);
	});

	it("names the Google OAuth app under a title that does not", () => {
		toastPresenter("google-oauth").problem(
			"Couldn't reach the release server",
		);

		expect(toasts.showProblem.mock.calls).toEqual([
			[
				{
					title: "Couldn't reach the release server",
					body: "Google OAuth app",
				},
			],
		]);
	});

	it("carries no subject line for the app", () => {
		toastPresenter("app").problem("Couldn't reach the release server");

		expect(toasts.showProblem.mock.calls).toEqual([
			[{ title: "Couldn't reach the release server", body: undefined }],
		]);
	});
});

describe("the up-to-date toast", () => {
	it("names the add-on that is up to date", () => {
		toastPresenter("recaptcha").upToDate();
		toastPresenter("google-oauth").upToDate();
		toastPresenter("fcm").upToDate();

		expect(toasts.showUpToDate.mock.calls).toStrictEqual([
			["The reCAPTCHA helper is up to date"],
			["The Google OAuth app is up to date"],
			["The FCM service is up to date"],
		]);
	});

	it("names Open Grind for the app itself", () => {
		toastPresenter("app").upToDate();

		expect(toasts.showUpToDate).toHaveBeenCalledExactlyOnceWith(
			"Open Grind is up to date",
		);
	});
});

describe("the installed toast", () => {
	it("hands the reCAPTCHA helper's install to the add-on toast", () => {
		toastPresenter("recaptcha").installed({
			tag: "v1.1.0",
			kind: "update",
		});

		expect(toasts.showAddonInstalled).toHaveBeenCalledExactlyOnceWith({
			component: "recaptcha",
			tag: "v1.1.0",
			kind: "update",
		});
		expect(toasts.showInstalled).not.toHaveBeenCalled();
	});
});
