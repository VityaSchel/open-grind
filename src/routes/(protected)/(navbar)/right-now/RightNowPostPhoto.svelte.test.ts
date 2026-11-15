// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { attachGalleryLightboxMock, detachMock, preloadFullImageMock } =
	vi.hoisted(() => {
		const detachMock = vi.fn();
		return {
			detachMock,
			attachGalleryLightboxMock: vi.fn<
				(options: {
					gallery: HTMLElement;
					croppedThumbs?: boolean;
				}) => () => void
			>(() => detachMock),
			preloadFullImageMock: vi.fn(),
		};
	});

vi.mock("#lib/util/photoswipe/gallery-lightbox.ts", () => ({
	attachGalleryLightbox: attachGalleryLightboxMock,
}));
vi.mock("#lib/util/photoswipe/full-size.ts", () => ({
	preloadFullImage: preloadFullImageMock,
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

async function showThumbnail() {
	const thumbnail = screen.getByRole<HTMLImageElement>("img", {
		name: "Post photo",
	});
	Object.defineProperty(thumbnail, "naturalWidth", { get: () => 320 });
	Object.defineProperty(thumbnail, "naturalHeight", { get: () => 320 });
	await fireEvent.load(thumbnail);
}

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

	it("has the lightbox zoom from the square thumbnail as a crop of the full-size photo", () => {
		render(RightNowPostPhoto, { props: { media: photo(1) } });

		expect(attachGalleryLightboxMock.mock.calls[0]?.[0]).toMatchObject({
			croppedThumbs: true,
		});
	});

	it("starts decoding the full-size photo once its thumbnail shows", async () => {
		const media = photo(1);
		render(RightNowPostPhoto, { props: { media } });
		expect(preloadFullImageMock).not.toHaveBeenCalled();

		await showThumbnail();

		expect(preloadFullImageMock).toHaveBeenCalledExactlyOnceWith(
			proxyMediaUrl(media.data.fullImageUrl),
		);
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

	it("decodes no full-size photo behind a blurred thumbnail", async () => {
		render(RightNowPostPhoto, { props: { media: blurredPhoto() } });

		await showThumbnail();

		expect(preloadFullImageMock).not.toHaveBeenCalled();
	});
});
