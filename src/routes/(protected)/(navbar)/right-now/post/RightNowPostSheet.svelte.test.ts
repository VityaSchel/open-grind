// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { MINUTE, ownPost } from "../right-now-post-test-helpers";
import { runningPost } from "./post-test-helpers.svelte";
import {
	renderSheet,
	saveButton,
	sheetShown,
	textField,
} from "./sheet-test-helpers.svelte";

const visibilitySwitch = () =>
	screen.getByRole("switch", { name: "Show my post" });

afterEach(cleanup);

describe("the Right Now post sheet header", () => {
	it("shows an active post with its time left and the switch on", async () => {
		await renderSheet(runningPost());

		expect(screen.getByText("Active · 42m left")).toBeTruthy();
		expect(visibilitySwitch().getAttribute("aria-checked")).toBe("true");
	});

	it("shows a hidden post as off with its time left", async () => {
		const fake = runningPost({ postStatus: "HIDDEN" });
		await renderSheet(fake);

		expect(screen.getByText("Off · 42m left")).toBeTruthy();
		expect(visibilitySwitch().getAttribute("aria-checked")).toBe("false");
	});

	it("describes the sheet with the post's status", async () => {
		await renderSheet(runningPost());

		const sheet = screen.getByRole("dialog", { name: "Right Now" });
		const description = document.getElementById(
			sheet.getAttribute("aria-describedby") ?? "",
		);
		expect(description?.textContent.trim()).toBe("Active · 42m left");
	});

	it("counts the time left down", async () => {
		const fake = runningPost();
		await renderSheet(fake);

		fake.timeLeftMs = 5 * MINUTE + 1;
		flushSync();

		expect(screen.getByText("Active · 5m left")).toBeTruthy();
	});

	it("turns the post off without asking, busy until the request ends", async () => {
		const fake = runningPost();
		const request = Promise.withResolvers<boolean>();
		fake.setHidden.mockImplementationOnce(() => {
			fake.saving = true;
			return request.promise.finally(() => {
				fake.saving = false;
			});
		});
		await renderSheet(fake);

		await fireEvent.click(visibilitySwitch());

		expect(fake.setHidden).toHaveBeenCalledWith({ hidden: true });
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(visibilitySwitch().getAttribute("aria-busy")).toBe("true");
		expect(visibilitySwitch().getAttribute("aria-checked")).toBe("false");
		expect(textField().matches(":disabled")).toBe(true);
		expect(screen.queryByRole("status", { hidden: true })).not.toBeNull();
		expect(saveButton().getAttribute("aria-busy")).toBe("false");

		fake.post = ownPost({ postStatus: "HIDDEN" });
		request.resolve(true);

		await vi.waitFor(() =>
			expect(visibilitySwitch().getAttribute("aria-busy")).not.toBe(
				"true",
			),
		);
		expect(screen.queryByRole("status", { hidden: true })).toBeNull();
		expect(visibilitySwitch().getAttribute("aria-checked")).toBe("false");
		expect(textField().matches(":disabled")).toBe(false);
	});

	it("turns an off post back on", async () => {
		const fake = runningPost({ postStatus: "HIDDEN" });
		await renderSheet(fake);

		await fireEvent.click(visibilitySwitch());

		expect(fake.setHidden).toHaveBeenCalledWith({ hidden: false });
	});

	it("falls back to the post's real state when turning it off fails", async () => {
		const fake = runningPost();
		fake.setHidden.mockResolvedValueOnce(false);
		await renderSheet(fake);

		await fireEvent.click(visibilitySwitch());

		await vi.waitFor(() =>
			expect(visibilitySwitch().getAttribute("aria-checked")).toBe(
				"true",
			),
		);
	});

	it("closes once the post is gone", async () => {
		const fake = runningPost();
		const stored = await renderSheet(fake);

		fake.post = null;
		flushSync();

		expect(stored.open).toBe(false);
		await vi.waitFor(() => expect(sheetShown()).toBe(false));
	});
});

describe("the Right Now post sheet rejections", () => {
	it.each<[{ text: boolean; photo: boolean }, string]>([
		[{ text: true, photo: false }, "Your text was rejected"],
		[{ text: false, photo: true }, "Your photo was rejected"],
		[{ text: true, photo: true }, "Your text and photo were rejected"],
	])("for %o says %s and lists the reasons", async (which, title) => {
		const fake = runningPost();
		fake.rejected = { ...which, reasons: ["Spam", "Nudity"] };
		await renderSheet(fake);

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain(title);
		expect(
			[...alert.querySelectorAll("li")].map((item) => item.textContent),
		).toEqual(["Spam", "Nudity"]);
	});

	it("says when no reason was given", async () => {
		const fake = runningPost();
		fake.rejected = { text: true, photo: false, reasons: [] };
		await renderSheet(fake);

		expect(screen.getByRole("alert").textContent).toContain(
			"No reason was given.",
		);
	});

	it("shows no rejection while nothing is rejected", async () => {
		await renderSheet(runningPost());

		expect(screen.queryByRole("alert")).toBeNull();
	});
});

describe("the Right Now post sheet form", () => {
	it("offers no map controls where the Right Now map doesn't exist", async () => {
		const fake = runningPost();
		fake.mapAvailable = false;

		await renderSheet(fake);

		expect(screen.getByRole("switch", { name: "Hosting" })).toBeTruthy();
		expect(
			screen.queryByRole("switch", { name: "Show me on map" }),
		).toBeNull();
	});

	it("marks the Hosting switch with an icon and leaves the map switch plain", async () => {
		await renderSheet(runningPost());

		const iconOfSwitch = (name: string) =>
			screen
				.getByRole("switch", { name })
				.closest('[data-slot="label"]')
				?.querySelector('[data-slot="switch-field-icon"]');
		expect(iconOfSwitch("Hosting")?.querySelector("svg")).toBeInstanceOf(
			SVGElement,
		);
		expect(iconOfSwitch("Show me on map")).toBeNull();
	});

	it("starts from the post's text, hosting and location", async () => {
		await renderSheet(
			runningPost({
				activeText: "Coffee?",
				hosting: true,
				shareLocation: "DISTANCE_AND_MAP",
				locationRadius: 30,
			}),
		);

		expect(textField().value).toBe("Coffee?");
		expect(
			screen
				.getByRole("switch", { name: "Hosting" })
				.getAttribute("aria-checked"),
		).toBe("true");
		expect(
			screen
				.getByRole("switch", { name: "Show me on map" })
				.getAttribute("aria-checked"),
		).toBe("true");
		expect(
			screen
				.getByRole("slider", { name: "Location accuracy" })
				.getAttribute("aria-valuenow"),
		).toBe("70");
	});

	it("follows the post while nothing is edited", async () => {
		const fake = runningPost();
		await renderSheet(fake);

		fake.post = ownPost({ activeText: "Approved" });
		flushSync();

		expect(textField().value).toBe("Approved");
	});
});
