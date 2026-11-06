// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { attachGalleryLightboxMock, detachMock } = vi.hoisted(() => {
	const detachMock = vi.fn();
	return {
		detachMock,
		attachGalleryLightboxMock: vi.fn<
			(options: { gallery: HTMLElement }) => () => void
		>(() => detachMock),
	};
});

vi.mock("#lib/util/photoswipe/gallery-lightbox.ts", () => ({
	attachGalleryLightbox: attachGalleryLightboxMock,
}));

import { proxyMediaUrl } from "#lib/util/media.ts";
import type { RightNowPostMediaItem } from "#lib/model/right-now/feed.ts";
import { photo } from "./feed-post-test-helpers";
import RightNowPostPhoto from "./RightNowPostPhoto.svelte";

function blurredPhoto(): RightNowPostMediaItem {
	const media = photo(1);
	return {
		...media,
		data: { ...media.data, isNsfw: true, shouldBlur: true },
	};
}

const openLink = () => screen.getByRole("link", { name: "Open photo" });

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("a Right Now post photo", () => {
	it("links the full-size photo for the gallery lightbox that chat images use", () => {
		const media = photo(1);
		render(RightNowPostPhoto, { props: { media } });

		expect(openLink().getAttribute("href")).toBe(
			proxyMediaUrl(media.data.fullImageUrl),
		);
		expect(attachGalleryLightboxMock).toHaveBeenCalledOnce();
		const gallery = attachGalleryLightboxMock.mock.calls[0]?.[0]?.gallery;
		expect(gallery?.contains(openLink())).toBe(true);
	});

	it("detaches the lightbox when the photo goes away", () => {
		const view = render(RightNowPostPhoto, { props: { media: photo(1) } });

		view.unmount();

		expect(detachMock).toHaveBeenCalledOnce();
	});

	it("keeps a blurred photo closed behind its nudity caption", () => {
		render(RightNowPostPhoto, { props: { media: blurredPhoto() } });

		expect(screen.queryByRole("link", { name: "Open photo" })).toBeNull();
		expect(attachGalleryLightboxMock).not.toHaveBeenCalled();
		expect(screen.getByRole("img", { name: "Post photo" })).toBeTruthy();
		expect(screen.getByText("May contain nudity")).toBeTruthy();
	});
});
