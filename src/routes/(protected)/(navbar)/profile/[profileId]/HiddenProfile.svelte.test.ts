// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { unhideUserMock, showErrorToastMock } = vi.hoisted(() => ({
	unhideUserMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));

vi.mock("$lib/api/browse/hides", () => ({ unhideUser: unhideUserMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { slot } from "$lib/i18n/fixtures/dom";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import HiddenProfile from "./HiddenProfile.svelte";

const PROFILE_ID = 7;

function renderHidden() {
	const pending = { revert: vi.fn(), settle: vi.fn() };
	render(HiddenProfile, {
		props: {
			profileId: PROFILE_ID,
			changingViewability: false,
			markViewable: () => pending,
		},
	});
	return pending;
}

async function failUnhide(): Promise<Error> {
	const failure = new Error("offline");
	unhideUserMock.mockRejectedValueOnce(failure);
	await fireEvent.click(screen.getByRole("button"));
	await vi.waitFor(() => {
		expect(showErrorToastMock).toHaveBeenCalledOnce();
	});
	return failure;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("HiddenProfile", () => {
	it("says the profile is hidden and offers Unhide", () => {
		renderHidden();

		expect(slot("empty-title").textContent).toBe("You Hid This Profile.");
		expect(screen.getByRole("button").textContent).toBe("Unhide");
	});

	it("toasts Failed to unhide user and reverts when unhiding fails", async () => {
		const pending = renderHidden();

		const failure = await failUnhide();

		expect(unhideUserMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to unhide user",
			error: failure,
		});
		expect(pending.revert).toHaveBeenCalledOnce();
		expect(pending.settle).not.toHaveBeenCalled();
	});

	it("words the screen and its failure in the active locale", async () => {
		renderHidden();

		await setLocale({ locale: "en-XA" });
		await failUnhide();

		expect(slot("empty-title").textContent).toMatch(PSEUDO_MESSAGE);
		expect(screen.getByRole("button").textContent).toMatch(PSEUDO_MESSAGE);
		expect(showErrorToastMock.mock.lastCall?.[0].label).toMatch(
			PSEUDO_MESSAGE,
		);
	});
});
