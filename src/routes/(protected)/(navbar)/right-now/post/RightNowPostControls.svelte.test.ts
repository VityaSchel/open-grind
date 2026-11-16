// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
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
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/state", () => ({
	page: { url: new URL("http://localhost/right-now") },
}));

import { rightNowPostSheetRequest } from "#lib/components/right-now/post-sheet-request-state.svelte.ts";
import { FakeRightNowPostState, runningPost } from "./post-test-helpers.svelte";
import RightNowPostControls from "./RightNowPostControls.svelte";

const sheet = () => screen.findByRole("dialog", { name: "Right Now" });

function renderControls(fake = new FakeRightNowPostState()) {
	const detach = vi.fn();
	fake.attachView.mockReturnValue(detach);
	const view = render(RightNowPostControls, {
		props: { ownPost: fake.state },
	});
	return { fake, detach, view };
}

afterEach(() => {
	cleanup();
	rightNowPostSheetRequest.take();
});

describe("the Right Now post controls", () => {
	it("attaches the post view while shown", () => {
		const { fake, detach, view } = renderControls();

		expect(fake.attachView).toHaveBeenCalledOnce();
		expect(detach).not.toHaveBeenCalled();

		view.unmount();

		expect(detach).toHaveBeenCalledOnce();
	});

	it("confirms the join and then opens the post sheet", async () => {
		const { fake } = renderControls();

		await fireEvent.click(
			screen.getByRole("button", { name: "Join · 3 left" }),
		);
		await fireEvent.click(
			await screen.findByRole("button", { name: "Join now" }),
		);

		expect(await sheet()).toBeTruthy();
		expect(fake.join).toHaveBeenCalledOnce();
	});

	it("opens the post sheet from the pill during a post", async () => {
		renderControls(runningPost());

		await fireEvent.click(
			screen.getByRole("button", {
				name: "Your Right Now post, 42m left",
			}),
		);

		expect(await sheet()).toBeTruthy();
	});

	it("opens the post sheet when it is asked for while the controls are shown", async () => {
		renderControls(runningPost());

		rightNowPostSheetRequest.request();
		flushSync();

		expect(await sheet()).toBeTruthy();
		expect(rightNowPostSheetRequest.pending).toBe(false);
	});

	it("opens the post sheet that was asked for before the controls showed", async () => {
		rightNowPostSheetRequest.request();

		renderControls(runningPost());

		expect(await sheet()).toBeTruthy();
	});

	it("waits for the post to load before opening the sheet that was asked for", async () => {
		const fake = runningPost();
		fake.loading = true;
		renderControls(fake);

		rightNowPostSheetRequest.request();
		flushSync();

		expect(rightNowPostSheetRequest.pending).toBe(true);
		expect(screen.queryByRole("dialog", { name: "Right Now" })).toBeNull();

		fake.loading = false;
		flushSync();

		expect(await sheet()).toBeTruthy();
	});

	it("drops a request for the sheet when there is no post to show in it", () => {
		renderControls();

		rightNowPostSheetRequest.request();
		flushSync();

		expect(rightNowPostSheetRequest.pending).toBe(false);
		expect(screen.queryByRole("dialog", { name: "Right Now" })).toBeNull();
	});

	it("drops a request that is still waiting when the controls go away", () => {
		const fake = runningPost();
		fake.loading = true;
		const { view } = renderControls(fake);
		rightNowPostSheetRequest.request();
		flushSync();

		view.unmount();

		expect(rightNowPostSheetRequest.pending).toBe(false);
	});
});
