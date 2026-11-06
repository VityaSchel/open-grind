// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const lightbox = vi.hoisted(() => ({
	openLightbox: vi.fn(() => Promise.resolve()),
}));
const errorToast = vi.hoisted(() => ({ showErrorToast: vi.fn() }));

vi.mock("#lib/util/photoswipe/index.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/util/photoswipe/index.ts")>()),
	...lightbox,
}));
vi.mock("#lib/api/error-toast.ts", () => errorToast);

import { proxyMediaUrl } from "#lib/util/media.ts";
import type { RightNowPostMediaItem } from "#lib/model/right-now/feed.ts";
import type { openLightbox } from "#lib/util/photoswipe/index.ts";
import { photo } from "./feed-post-test-helpers";
import RightNowPostPhoto from "./RightNowPostPhoto.svelte";

function lightboxCalls(): Parameters<typeof openLightbox>[] {
	return lightbox.openLightbox.mock.calls as unknown as Parameters<
		typeof openLightbox
	>[];
}

function blurredPhoto(): RightNowPostMediaItem {
	const media = photo(1);
	return {
		...media,
		data: { ...media.data, isNsfw: true, shouldBlur: true },
	};
}

const openButton = () => screen.getByRole("button", { name: "Open photo" });

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe("a Right Now post photo", () => {
	it("opens the full-size photo in the lightbox", async () => {
		const media = photo(1);
		render(RightNowPostPhoto, { props: { media } });

		await fireEvent.click(openButton());

		expect(lightbox.openLightbox).toHaveBeenCalledOnce();
		expect(lightboxCalls()[0]?.[0].items[0]?.src).toBe(
			proxyMediaUrl(media.data.fullImageUrl),
		);
	});

	it("opens the lightbox again after it closes", async () => {
		render(RightNowPostPhoto, { props: { media: photo(1) } });

		await fireEvent.click(openButton());
		lightboxCalls()[0]?.[0].onClosed();
		await tick();
		await fireEvent.click(openButton());

		expect(lightbox.openLightbox).toHaveBeenCalledTimes(2);
	});

	it("aborts an opening lightbox when unmounted", async () => {
		const view = render(RightNowPostPhoto, { props: { media: photo(1) } });

		await fireEvent.click(openButton());
		const signal = lightboxCalls()[0]?.[0].signal;
		view.unmount();

		expect(signal?.aborted).toBe(true);
	});

	it("reports a lightbox that fails to open", async () => {
		const error = new Error("photoswipe failed");
		lightbox.openLightbox.mockRejectedValueOnce(error);
		vi.spyOn(console, "error").mockImplementation(() => {});
		render(RightNowPostPhoto, { props: { media: photo(1) } });

		await fireEvent.click(openButton());

		await vi.waitFor(() =>
			expect(errorToast.showErrorToast).toHaveBeenCalledExactlyOnceWith({
				label: "Failed to open photo",
				error,
			}),
		);
	});

	it("keeps a blurred photo closed behind its nudity caption", () => {
		render(RightNowPostPhoto, { props: { media: blurredPhoto() } });

		expect(screen.queryByRole("button", { name: "Open photo" })).toBeNull();
		expect(screen.getByRole("img", { name: "Post photo" })).toBeTruthy();
		expect(screen.getByText("May contain nudity")).toBeTruthy();
	});
});
