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

import { FakeRightNowPostState, runningPost } from "./post-test-helpers.svelte";
import RightNowPostControls from "./RightNowPostControls.svelte";

const sheet = () => screen.findByRole("dialog", { name: "Right Now" });

function renderControls(fake = new FakeRightNowPostState()) {
	const detach = vi.fn();
	fake.attachView.mockReturnValue(detach);
	const view = render(RightNowPostControls, { props: { post: fake.state } });
	return { fake, detach, view };
}

afterEach(cleanup);

describe("the Right Now post controls", () => {
	it("attaches the post view while shown", () => {
		const { fake, detach, view } = renderControls();

		expect(fake.attachView).toHaveBeenCalledOnce();
		expect(detach).not.toHaveBeenCalled();

		view.unmount();

		expect(detach).toHaveBeenCalledOnce();
	});

	it("confirms the join and then opens the post sheet", async () => {
		const fake = new FakeRightNowPostState();
		fake.join.mockImplementationOnce(() => {
			fake.startPost();
			return Promise.resolve(true);
		});
		renderControls(fake);

		await fireEvent.click(
			screen.getByRole("button", { name: "Join · 3 free" }),
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

	it("opens the post sheet when the state asks for it", async () => {
		const { fake } = renderControls(runningPost());
		const listener = fake.onSheetRequest.mock.lastCall?.[0];

		expect(listener).toBeTypeOf("function");
		listener?.();
		flushSync();

		expect(await sheet()).toBeTruthy();
	});
});
