// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import {
	answerAccountSwitch,
	confirmAccountSwitch,
	googleHandoffState,
} from "$lib/api/google-handoff-state.svelte";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import GoogleHandoffConfirmAlert from "./GoogleHandoffConfirmAlert.svelte";

const TITLE = "Switch Google account?";
const DESCRIPTION =
	"You have signed in to another Google account using the Google OAuth app.";

function askToSwitch(): Promise<boolean> {
	const answer = confirmAccountSwitch();
	render(GoogleHandoffConfirmAlert);
	return answer;
}

function findPrompt(): Promise<HTMLElement> {
	return screen.findByRole("alertdialog", {
		name: TITLE,
		description: DESCRIPTION,
	});
}

afterEach(async () => {
	cleanup();
	answerAccountSwitch(false);
	googleHandoffState.phase = "idle";
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("GoogleHandoffConfirmAlert", () => {
	it("asks before switching to the other Google account", async () => {
		void askToSwitch();

		const prompt = await findPrompt();

		expect(
			within(prompt)
				.getAllByRole("button")
				.map((button) => button.textContent.trim()),
		).toStrictEqual(["Cancel", "Continue"]);
	});

	it.each([
		{ action: "Continue", accepted: true },
		{ action: "Cancel", accepted: false },
	])(
		"answers $accepted when $action is pressed",
		async ({ action, accepted }) => {
			const answer = askToSwitch();
			const prompt = await findPrompt();

			await fireEvent.click(
				within(prompt).getByRole("button", { name: action }),
			);

			expect(await answer).toBe(accepted);
		},
	);

	it("shows progress on Continue while switching", async () => {
		googleHandoffState.phase = "switchingAccount";
		render(GoogleHandoffConfirmAlert);

		const prompt = await findPrompt();
		const progress = within(prompt).getByRole("button", {
			name: "Loading Continue",
		});

		expect(within(progress).getByRole("status")).toBeTruthy();
	});

	it("words the prompt in the active locale", async () => {
		void askToSwitch();
		const prompt = await findPrompt();
		const lines = [
			within(prompt).getByRole("heading", { name: TITLE }),
			within(prompt).getByText(DESCRIPTION),
			...within(prompt).getAllByRole("button"),
		];

		await setLocale({ locale: "en-XA" });

		for (const line of lines) {
			expect(line.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		}
	});
});
