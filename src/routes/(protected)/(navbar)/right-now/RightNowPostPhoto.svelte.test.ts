// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("#lib/api/current-session.ts", () => ({
	signedInProfileIdSnapshot: () => 858049792,
	signedInProfileId: () => Promise.resolve(858049792),
}));

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
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

beforeEach(() => runningOn("windows"));

afterEach(() => {
	cleanup();
	resetPlatform();
	vi.clearAllMocks();
	vi.unstubAllEnvs();
});

describe("a Right Now post photo", () => {
	it("links the full-size photo for the gallery lightbox that chat images use", () => {
		const media = photo(1);
		render(RightNowPostPhoto, { props: { media, own: false } });

		expect(openLink().getAttribute("href")).toBe(
			proxyMediaUrl(media.data.fullImageUrl),
		);
		expect(attachGalleryLightboxMock).toHaveBeenCalledOnce();
		const gallery = attachGalleryLightboxMock.mock.calls[0]?.[0]?.gallery;
		expect(gallery?.contains(openLink())).toBe(true);
	});

	it("has the lightbox zoom from the square thumbnail as a crop of the full-size photo", () => {
		render(RightNowPostPhoto, { props: { media: photo(1), own: false } });

		expect(attachGalleryLightboxMock.mock.calls[0]?.[0]).toMatchObject({
			croppedThumbs: true,
		});
	});

	it("starts decoding the full-size photo once its thumbnail shows", async () => {
		const media = photo(1);
		render(RightNowPostPhoto, { props: { media, own: false } });
		expect(preloadFullImageMock).not.toHaveBeenCalled();

		await showThumbnail();

		expect(preloadFullImageMock).toHaveBeenCalledExactlyOnceWith(
			proxyMediaUrl(media.data.fullImageUrl),
		);
	});

	it("detaches the lightbox when the photo goes away", () => {
		const view = render(RightNowPostPhoto, {
			props: { media: photo(1), own: false },
		});

		view.unmount();

		expect(detachMock).toHaveBeenCalledOnce();
	});

	it("keeps a blurred photo closed behind its nudity caption", () => {
		render(RightNowPostPhoto, {
			props: { media: blurredPhoto(), own: false },
		});

		expect(screen.queryByRole("link", { name: "Open photo" })).toBeNull();
		expect(attachGalleryLightboxMock).not.toHaveBeenCalled();
		expect(screen.getByRole("img", { name: "Post photo" })).toBeTruthy();
		expect(screen.getByText("May contain nudity")).toBeTruthy();
	});

	it("decodes no full-size photo behind a blurred thumbnail", async () => {
		render(RightNowPostPhoto, {
			props: { media: blurredPhoto(), own: false },
		});

		await showThumbnail();

		expect(preloadFullImageMock).not.toHaveBeenCalled();
	});
});

describe("a Right Now post photo on Google Play", () => {
	it("covers someone else's photo with a link to the mature content setting instead of the lightbox", async () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		const media = photo(1);
		render(RightNowPostPhoto, { props: { media, own: false } });

		expect(
			screen
				.getByRole("link", { name: "Show mature content" })
				.getAttribute("href"),
		).toBe("/settings/app/display#show-mature-content");
		expect(screen.queryByRole("link", { name: "Open photo" })).toBeNull();
		expect(attachGalleryLightboxMock).not.toHaveBeenCalled();
		await showThumbnail();
		expect(preloadFullImageMock).toHaveBeenCalledExactlyOnceWith(
			proxyMediaUrl(media.data.fullImageUrl),
		);
	});

	it("shows our own photo", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		render(RightNowPostPhoto, { props: { media: photo(1), own: true } });

		expect(openLink()).toBeTruthy();
		expect(
			screen.queryByRole("link", { name: "Show mature content" }),
		).toBeNull();
	});
});
