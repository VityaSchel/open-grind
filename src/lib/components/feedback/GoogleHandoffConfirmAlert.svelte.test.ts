// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import {
	confirmAccountSwitch,
	googleHandoffState,
} from "$lib/api/google-handoff-state.svelte";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import GoogleHandoffConfirmAlert from "./GoogleHandoffConfirmAlert.svelte";

const continueButton = () => screen.getByRole("button", { name: "Continue" });
const dialogShown = () => screen.queryByText("Switch Google account?") !== null;

describe("GoogleHandoffConfirmAlert", () => {
	afterEach(() => {
		cleanup();
		googleHandoffState.phase = "idle";
		googleHandoffState.answerSwitch = null;
	});

	it("cancels the account switch on the back gesture", async () => {
		const answer = confirmAccountSwitch();
		render(GoogleHandoffConfirmAlert);

		expect(backGestureEventHandlers.size).toBe(1);
		for (const handler of backGestureEventHandlers) handler();

		expect(await answer).toBe(false);
		expect(googleHandoffState.phase).toBe("idle");
	});

	it("marks Continue busy and swallows the back gesture while switching accounts", async () => {
		const answer = confirmAccountSwitch();
		render(GoogleHandoffConfirmAlert);
		await fireEvent.click(continueButton());

		expect(continueButton().getAttribute("aria-busy")).toBe("true");
		expect(backGestureEventHandlers.size).toBe(1);
		for (const handler of backGestureEventHandlers) handler();

		expect(await answer).toBe(true);
		expect(googleHandoffState.phase).toBe("switchingAccount");
		expect(dialogShown()).toBe(true);
	});
});
