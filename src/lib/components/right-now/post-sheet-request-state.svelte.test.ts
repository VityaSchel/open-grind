import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { gotoMock, page } = vi.hoisted(() => ({
	gotoMock: vi.fn(() => Promise.resolve()),
	page: { url: new URL("http://localhost/profile/7") },
}));

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("$app/state", () => ({ page }));

import { clearAccountCaches } from "#lib/api/account-caches.ts";
import { rightNowPostSheetRequest } from "./post-sheet-request-state.svelte";

afterEach(() => {
	rightNowPostSheetRequest.take();
	gotoMock.mockReset();
	gotoMock.mockImplementation(() => Promise.resolve());
	page.url = new URL("http://localhost/profile/7");
});

describe("the Right Now post sheet request", () => {
	it("goes to Right Now when the sheet is asked for on another page", () => {
		rightNowPostSheetRequest.request();

		expect(gotoMock).toHaveBeenCalledExactlyOnceWith("/right-now");
		expect(rightNowPostSheetRequest.pending).toBe(true);
	});

	it("stays on Right Now when the sheet is asked for there", () => {
		page.url = new URL("http://localhost/right-now");

		rightNowPostSheetRequest.request();

		expect(gotoMock).not.toHaveBeenCalled();
		expect(rightNowPostSheetRequest.pending).toBe(true);
	});

	it("keeps the request when the navigation lands on Right Now", async () => {
		gotoMock.mockImplementation(() => {
			page.url = new URL("http://localhost/right-now");
			return Promise.resolve();
		});

		rightNowPostSheetRequest.request();
		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledOnce());
		await Promise.resolve();

		expect(rightNowPostSheetRequest.pending).toBe(true);
	});

	it.each([
		{ outcome: "ends on another page", go: () => Promise.resolve() },
		{
			outcome: "fails",
			go: () => Promise.reject(new Error("navigation cancelled")),
		},
	])(
		"drops the request when the navigation to Right Now $outcome, so it cannot open the sheet on a later visit",
		async ({ go }) => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			gotoMock.mockImplementation(go);

			rightNowPostSheetRequest.request();

			await vi.waitFor(() =>
				expect(rightNowPostSheetRequest.pending).toBe(false),
			);
			vi.restoreAllMocks();
		},
	);

	it("forgets a request on sign-out, so it cannot open the next account's sheet", () => {
		page.url = new URL("http://localhost/right-now");
		rightNowPostSheetRequest.request();

		clearAccountCaches();

		expect(rightNowPostSheetRequest.pending).toBe(false);
	});

	it("hands a request out once", () => {
		page.url = new URL("http://localhost/right-now");
		rightNowPostSheetRequest.request();

		expect(rightNowPostSheetRequest.take()).toBe(true);
		expect(rightNowPostSheetRequest.take()).toBe(false);
		expect(rightNowPostSheetRequest.pending).toBe(false);
	});

	it("tells a screen that is already showing as soon as the sheet is asked for", () => {
		let seen = false;
		const stop = $effect.root(() => {
			$effect(() => {
				seen = rightNowPostSheetRequest.pending;
			});
		});
		flushSync();
		page.url = new URL("http://localhost/right-now");

		rightNowPostSheetRequest.request();
		flushSync();

		expect(seen).toBe(true);
		stop();
	});
});
