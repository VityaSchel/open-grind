// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { photoApi, pickMediaMock } = vi.hoisted(() => ({
	photoApi: {
		uploadRightNowPhotoFromUrl: vi.fn(),
		uploadRightNowPickedPhoto: vi.fn(),
		RightNowPhotoTooSmallError: class extends Error {},
	},
	pickMediaMock: vi.fn(),
}));

vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	preferencesSnapshot: () => ({ units: "metric" }),
}));
vi.mock("#lib/api/messaging/drawer.ts", () => ({
	getAllDrawerMedia: vi.fn(() => Promise.resolve([])),
	deleteDrawerMedia: vi.fn(),
}));
vi.mock("#lib/api/right-now/photo.ts", () => photoApi);
vi.mock("#lib/platform/media-picker.ts", () => ({ pickMedia: pickMediaMock }));
vi.mock("#lib/api/error-toast.ts", () => ({ showErrorToast: vi.fn() }));

import { runBackGestureHandlers } from "#lib/platform/back-gesture-event.svelte.ts";
import type { RightNowMediaUploadResponse } from "#lib/model/right-now/post.ts";
import { ownPost, postPhoto } from "../right-now-post-test-helpers";
import { runningPost } from "./post-test-helpers.svelte";
import {
	renderSheet,
	saveButton,
	sheetShown,
	textField,
} from "./sheet-test-helpers.svelte";

async function type(value: string) {
	await fireEvent.input(textField(), { target: { value } });
}

afterEach(cleanup);

describe("saving the Right Now post", () => {
	it("keeps Save off until something changes", async () => {
		await renderSheet(runningPost());

		expect(saveButton().matches(":disabled")).toBe(true);

		await type("Coffee?");

		expect(saveButton().matches(":disabled")).toBe(false);
	});

	it("sends only the changed keys and closes", async () => {
		const fake = runningPost();
		const stored = await renderSheet(fake);

		await type("  Coffee at mine?");
		await fireEvent.click(screen.getByRole("switch", { name: "Hosting" }));
		await fireEvent.click(saveButton());

		expect(fake.save).toHaveBeenCalledExactlyOnceWith({
			changes: { text: "Coffee at mine?", hosting: true },
		});
		await vi.waitFor(() => expect(stored.open).toBe(false));
	});

	it("still saves other fields when the post's own text is over 140 characters", async () => {
		const fake = runningPost({ activeText: "a".repeat(200) });
		await renderSheet(fake);

		await fireEvent.click(screen.getByRole("switch", { name: "Hosting" }));
		await fireEvent.click(saveButton());

		expect(fake.save).toHaveBeenCalledExactlyOnceWith({
			changes: { hosting: true },
		});
	});

	it("stops sharing a distance-only post's location once the map switch is turned on and off", async () => {
		const fake = runningPost({ shareLocation: "DISTANCE_ONLY" });
		await renderSheet(fake);
		const mapSwitch = screen.getByRole("switch", {
			name: "Show me on map",
		});

		expect(mapSwitch.getAttribute("aria-checked")).toBe("false");
		expect(saveButton().matches(":disabled")).toBe(true);

		await fireEvent.click(mapSwitch);
		await fireEvent.click(mapSwitch);
		await fireEvent.click(saveButton());

		expect(fake.save).toHaveBeenCalledExactlyOnceWith({
			changes: { shareLocation: "NONE" },
		});
	});

	it("shares the location at the least precise radius when the map switch goes on", async () => {
		const fake = runningPost();
		await renderSheet(fake);

		await fireEvent.click(
			screen.getByRole("switch", { name: "Show me on map" }),
		);
		await fireEvent.click(saveButton());

		expect(fake.save).toHaveBeenCalledExactlyOnceWith({
			changes: { shareLocation: "DISTANCE_AND_MAP", locationRadius: 100 },
		});
	});

	it("turns typed newlines into spaces", async () => {
		await renderSheet(runningPost());

		await type("Coffee?\nNow");

		expect(textField().value).toBe("Coffee? Now");
	});

	it("blocks saving text over 140 characters", async () => {
		await renderSheet(runningPost());

		await type("a".repeat(141));

		expect(screen.getByText("-1")).toBeTruthy();
		expect(saveButton().matches(":disabled")).toBe(true);
	});

	it("marks Save busy and locks the form while saving", async () => {
		const fake = runningPost();
		await renderSheet(fake);
		await type("Coffee?");

		fake.saving = true;
		flushSync();

		expect(saveButton().getAttribute("aria-busy")).toBe("true");
		expect(saveButton().matches(":disabled")).toBe(true);
		expect(textField().matches(":disabled")).toBe(true);
		expect(
			screen
				.getByRole("switch", { name: "Show my post" })
				.matches(":disabled"),
		).toBe(true);
		expect(
			screen
				.getByRole("switch", { name: "Hosting" })
				.matches(":disabled"),
		).toBe(true);
	});

	it("removes the saved photo only when saving, and keeps it on undo", async () => {
		const fake = runningPost({ media: [postPhoto({ mediaId: 316 })] });
		await renderSheet(fake);

		await fireEvent.click(
			screen.getByRole("button", { name: "Remove photo" }),
		);
		await fireEvent.click(
			screen.getByRole("button", { name: "Keep photo" }),
		);

		expect(saveButton().matches(":disabled")).toBe(true);

		await fireEvent.click(
			screen.getByRole("button", { name: "Remove photo" }),
		);
		await fireEvent.click(saveButton());

		expect(fake.save).toHaveBeenCalledExactlyOnceWith({
			changes: { media: [] },
		});
	});

	it("stays open with the edits when saving fails", async () => {
		const fake = runningPost();
		fake.save.mockResolvedValueOnce(false);
		const stored = await renderSheet(fake);

		await type("Coffee?");
		await fireEvent.click(saveButton());

		await vi.waitFor(() => expect(fake.save).toHaveBeenCalledOnce());
		expect(stored.open).toBe(true);
		expect(textField().value).toBe("Coffee?");
	});

	it("keeps the edits when the post updates underneath them", async () => {
		const fake = runningPost();
		await renderSheet(fake);

		await type("Mine");
		fake.post = ownPost({ activeText: "Theirs" });
		flushSync();

		expect(textField().value).toBe("Mine");
	});

	it("keeps Save locked while the photo uploads and then sends it as media", async () => {
		const fake = runningPost();
		await renderSheet(fake);
		await type("Coffee?");
		pickMediaMock.mockResolvedValueOnce({
			key: "picked",
			mimeType: "image/jpeg",
			source: "desktop",
			path: "/tmp/photo.jpg",
		});
		const upload = Promise.withResolvers<RightNowMediaUploadResponse>();
		photoApi.uploadRightNowPickedPhoto.mockReturnValueOnce(upload.promise);

		await fireEvent.click(
			screen.getByRole("button", { name: "Add photo" }),
		);
		await fireEvent.click(
			await screen.findByRole("button", { name: "Upload a photo" }),
		);

		expect(await screen.findByText("Uploading photo")).toBeTruthy();
		expect(saveButton().matches(":disabled")).toBe(true);

		upload.resolve({
			mediaId: 88,
			url: "https://cdns.grindr.com/rightnow/full/88",
			thumbnailUrl: "https://cdns.grindr.com/rightnow/thumb/88",
		});
		await vi.waitFor(() =>
			expect(saveButton().matches(":disabled")).toBe(false),
		);
		await fireEvent.click(saveButton());

		expect(fake.save).toHaveBeenCalledExactlyOnceWith({
			changes: {
				text: "Coffee?",
				media: [{ type: "image_v1", data: { id: 88 } }],
			},
		});
	});
});

describe("closing the Right Now post sheet", () => {
	const discardPrompt = () =>
		screen.queryByRole("alertdialog", { name: "Discard changes?" });

	it("closes at once without asking when nothing changed", async () => {
		const stored = await renderSheet(runningPost());

		runBackGestureHandlers();
		flushSync();

		expect(stored.open).toBe(false);
		expect(discardPrompt()).toBeNull();
	});

	it("asks before dropping unsaved edits and keeps them on Keep editing", async () => {
		const stored = await renderSheet(runningPost());
		await type("Coffee?");

		runBackGestureHandlers();

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
		expect(stored.open).toBe(true);
		expect(textField().value).toBe("Coffee?");
	});

	it("closes only the prompt on a second back gesture", async () => {
		const stored = await renderSheet(runningPost());
		await type("Coffee?");
		runBackGestureHandlers();
		await screen.findByRole("alertdialog", { name: "Discard changes?" });

		runBackGestureHandlers();

		await vi.waitFor(() => expect(discardPrompt()).toBeNull());
		expect(stored.open).toBe(true);
	});

	it("asks on Escape as well", async () => {
		const stored = await renderSheet(runningPost());
		await type("Coffee?");

		await fireEvent.keyDown(textField(), { key: "Escape" });

		expect(
			await screen.findByRole("alertdialog", {
				name: "Discard changes?",
			}),
		).toBeTruthy();
		expect(stored.open).toBe(true);
	});

	it("drops the edits and closes on Discard", async () => {
		const fake = runningPost();
		const stored = await renderSheet(fake);
		await type("Coffee?");
		runBackGestureHandlers();

		await fireEvent.click(
			await screen.findByRole("button", { name: "Discard" }),
		);

		expect(stored.open).toBe(false);
		expect(fake.save).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(sheetShown()).toBe(false));
	});

	it("stays open while a save runs", async () => {
		const fake = runningPost();
		const stored = await renderSheet(fake);
		fake.saving = true;
		flushSync();

		runBackGestureHandlers();
		flushSync();

		expect(stored.open).toBe(true);
	});

	it("starts over from the post when opened again after closing", async () => {
		const stored = await renderSheet(runningPost());
		await type("Coffee?");
		runBackGestureHandlers();
		await fireEvent.click(
			await screen.findByRole("button", { name: "Discard" }),
		);
		await vi.waitFor(() => expect(sheetShown()).toBe(false));

		stored.open = true;

		await vi.waitFor(() => expect(textField().value).toBe(""));
	});
});
