import { render, screen } from "@testing-library/svelte";
import { vi } from "vitest";

import { topBackGestureHandler } from "#lib/platform/back-gesture-event.svelte.ts";
import { FakeRightNowPostState } from "./post-test-helpers.svelte";
import RightNowPostSheet from "./RightNowPostSheet.svelte";

export function stubResizeObserver(): void {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
}

export async function renderSheet(fake: FakeRightNowPostState) {
	const stored = $state({ open: true });
	render(RightNowPostSheet, {
		props: {
			post: fake.state,
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

export function runningPost(): FakeRightNowPostState {
	const fake = new FakeRightNowPostState();
	fake.startPost();
	return fake;
}

export const sheetShown = () =>
	screen.queryByRole("dialog", { name: "Right Now" }) !== null;

export const textField = () => screen.getByRole("textbox", { name: "Text" });

export const saveButton = () => screen.getByRole("button", { name: "Save" });

export function goBack(): void {
	topBackGestureHandler()?.();
}
