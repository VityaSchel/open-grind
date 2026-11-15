import { render, screen } from "@testing-library/svelte";

import type { FakeRightNowPostState } from "./post-test-helpers.svelte";
import RightNowPostSheet from "./RightNowPostSheet.svelte";

export async function renderSheet(fake: FakeRightNowPostState) {
	const stored = $state({ open: true });
	render(RightNowPostSheet, {
		props: {
			ownPost: fake.state,
			get open() {
				return stored.open;
			},
			set open(next: boolean) {
				stored.open = next;
			},
		},
	});
	await screen.findByRole("dialog", { name: "Right Now" });
	return stored;
}

export const sheetShown = () =>
	screen.queryByRole("dialog", { name: "Right Now" }) !== null;

export const textField = () =>
	screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Text" });

export const saveButton = () => screen.getByRole("button", { name: "Save" });
