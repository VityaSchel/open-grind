// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import SignOutButton from "./SignOutButton.svelte";

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));

vi.mock("$lib/api/sign-out", () => ({ signOut: signOutMock }));

const continueButton = () => screen.getByRole("button", { name: "Continue" });
const cancelButton = () => screen.getByRole("button", { name: "Cancel" });
const dialogShown = () => screen.queryByText("Sign out?") !== null;

async function openDialog() {
	await fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
	await vi.waitFor(continueButton);
}

async function startSignOutThatHangs() {
	const signOut = Promise.withResolvers<void>();
	signOutMock.mockReturnValueOnce(signOut.promise);
	await openDialog();
	await fireEvent.click(continueButton());
	return signOut.resolve;
}

describe("SignOutButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		signOutMock.mockResolvedValue(undefined);
		render(SignOutButton);
	});

	afterEach(cleanup);

	it("marks Continue busy and locks both buttons while signing out", async () => {
		const finishSignOut = await startSignOutThatHangs();

		expect(continueButton().getAttribute("aria-busy")).toBe("true");
		expect(continueButton().matches(":disabled")).toBe(true);
		expect(cancelButton().matches(":disabled")).toBe(true);

		finishSignOut();
		await vi.waitFor(() => expect(dialogShown()).toBe(false));
	});

	it("keeps Escape from closing the dialog while signing out", async () => {
		const finishSignOut = await startSignOutThatHangs();

		await fireEvent.keyDown(document, { key: "Escape" });

		expect(dialogShown()).toBe(true);
		finishSignOut();
		await vi.waitFor(() => expect(dialogShown()).toBe(false));
	});

	it("swallows the back gesture while signing out", async () => {
		const finishSignOut = await startSignOutThatHangs();

		expect(backGestureEventHandlers.size).toBe(1);
		for (const handler of backGestureEventHandlers) handler();
		await tick();

		expect(screen.getByRole("alertdialog").dataset.state).toBe("open");
		finishSignOut();
		await vi.waitFor(() => expect(dialogShown()).toBe(false));
	});

	it("closes on the back gesture without signing out", async () => {
		await openDialog();

		for (const handler of backGestureEventHandlers) handler();

		await vi.waitFor(() => expect(dialogShown()).toBe(false));
		expect(signOutMock).not.toHaveBeenCalled();
	});
});
