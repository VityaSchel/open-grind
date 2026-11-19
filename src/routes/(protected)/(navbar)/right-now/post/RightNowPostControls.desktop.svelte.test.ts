// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
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
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/state", () => ({
	page: { url: new URL("http://localhost/right-now") },
}));

import { rightNowPostSheetRequest } from "#lib/components/right-now/post-sheet-request-state.svelte.ts";
import { FakeRightNowPostState, runningPost } from "./post-test-helpers.svelte";
import RightNowPostControls from "./RightNowPostControls.svelte";

afterEach(() => {
	cleanup();
	rightNowPostSheetRequest.take();
	document.body.replaceChildren();
});

describe("the Right Now post controls on desktop", () => {
	it("hands focus to the new post pill when the sheet opened by a join closes", async () => {
		const fake = new FakeRightNowPostState();
		fake.attachView.mockReturnValue(() => {});
		render(RightNowPostControls, { props: { ownPost: fake.state } });
		const join = screen.getByRole("button", { name: "Join · 3 left" });
		join.focus();
		await fireEvent.click(join);
		const joinNow = await screen.findByRole("button", { name: "Join now" });
		joinNow.focus();
		await fireEvent.click(joinNow);
		const sheet = await screen.findByRole("dialog", { name: "Right Now" });
		await vi.waitFor(() => expect(document.activeElement).toBe(sheet));

		await fireEvent.click(screen.getByRole("button", { name: "Close" }));

		await vi.waitFor(() => expect(sheet.isConnected).toBe(false));
		const pill = screen.getByRole("button", {
			name: "Your Right Now post, 42m left",
		});
		await vi.waitFor(() => expect(document.activeElement).toBe(pill));
	}, 30_000);

	it("leaves focus on an opener outside the controls when the sheet closes", async () => {
		const fake = runningPost();
		fake.attachView.mockReturnValue(() => {});
		render(RightNowPostControls, { props: { ownPost: fake.state } });
		const edit = document.createElement("button");
		edit.textContent = "Edit your post";
		document.body.append(edit);
		edit.focus();
		rightNowPostSheetRequest.request();
		const sheet = await screen.findByRole("dialog", { name: "Right Now" });
		await vi.waitFor(() => expect(document.activeElement).toBe(sheet));

		await fireEvent.click(screen.getByRole("button", { name: "Close" }));

		await vi.waitFor(() => expect(sheet.isConnected).toBe(false));
		expect(document.activeElement).toBe(edit);
	}, 30_000);
});
