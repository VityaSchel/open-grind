// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/util/breakpoints.svelte.ts", () => ({
	above: () => ({ current: true }),
	below: () => ({ current: false }),
}));
vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	preferencesSnapshot: () => ({ units: "metric" }),
}));
vi.mock("#lib/api/messaging/drawer.ts", () => ({
	getAllDrawerMedia: vi.fn(() => Promise.resolve([])),
	deleteDrawerMedia: vi.fn(),
}));
vi.mock("#lib/api/right-now/photo.ts", () => ({
	uploadRightNowPhotoFromUrl: vi.fn(),
	uploadRightNowPickedPhoto: vi.fn(),
	RightNowPhotoTooSmallError: class extends Error {},
}));
vi.mock("#lib/platform/media-picker.ts", () => ({ pickMedia: vi.fn() }));
vi.mock("#lib/api/error-toast.ts", () => ({ showErrorToast: vi.fn() }));

import { runningPost } from "./post-test-helpers.svelte";
import {
	renderSheet,
	sheetShown,
	textField,
} from "./sheet-test-helpers.svelte";

const columns = () =>
	document.querySelector('[data-slot="right-now-post-sheet-columns"]');
const discardPrompt = () =>
	screen.queryByRole("alertdialog", { name: "Discard changes?" });

afterEach(cleanup);

describe("the Right Now post dialog on desktop", () => {
	it("puts the map controls in a column beside the text, photo and hosting", async () => {
		await renderSheet(runningPost());

		const [form, location] = columns()?.children ?? [];
		expect(form?.contains(textField())).toBe(true);
		expect(
			location?.contains(
				screen.getByRole("switch", { name: "Show me on map" }),
			),
		).toBe(true);
	});

	it("keeps one column where the Right Now map doesn't exist", async () => {
		const fake = runningPost();
		fake.mapAvailable = false;

		await renderSheet(fake);

		expect(columns()?.children).toHaveLength(1);
	});

	it("closes from its close button when nothing changed", async () => {
		const stored = await renderSheet(runningPost());

		await fireEvent.click(screen.getByRole("button", { name: "Close" }));

		expect(stored.open).toBe(false);
		await vi.waitFor(() => expect(sheetShown()).toBe(false));
	});

	it("asks before dropping edits on the close button and on Escape", async () => {
		const stored = await renderSheet(runningPost());
		await fireEvent.input(textField(), { target: { value: "Coffee?" } });

		await fireEvent.click(screen.getByRole("button", { name: "Close" }));

		expect(
			await screen.findByRole("alertdialog", {
				name: "Discard changes?",
			}),
		).toBeTruthy();
		expect(stored.open).toBe(true);
		await fireEvent.click(
			screen.getByRole("button", { name: "Keep editing" }),
		);
		await vi.waitFor(() => expect(discardPrompt()).toBeNull());

		await fireEvent.keyDown(textField(), { key: "Escape" });

		expect(
			await screen.findByRole("alertdialog", {
				name: "Discard changes?",
			}),
		).toBeTruthy();
		expect(stored.open).toBe(true);
		expect(textField().value).toBe("Coffee?");
	});
});
