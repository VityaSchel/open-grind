// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import type { MediaDimensions } from "#lib/util/media-dimensions.ts";
import type { fullImageSizeWithin, knownFullImageSize } from "./full-size";

const { lightboxes, fullImageSizeWithinMock, knownFullImageSizeMock } =
	vi.hoisted(() => ({
		lightboxes: [] as PhotoSwipeLightbox[],
		fullImageSizeWithinMock: vi.fn<typeof fullImageSizeWithin>(),
		knownFullImageSizeMock: vi.fn<typeof knownFullImageSize>(),
	}));

vi.mock("photoswipe/lightbox", async (importOriginal) => {
	const { default: Lightbox } =
		await importOriginal<typeof import("photoswipe/lightbox")>();
	class RecordedLightbox extends Lightbox {
		constructor(options?: ConstructorParameters<typeof Lightbox>[0]) {
			super(options);
			lightboxes.push(this);
		}
	}
	return { default: RecordedLightbox };
});
vi.mock("./full-size", () => ({
	fullImageSizeWithin: fullImageSizeWithinMock,
	knownFullImageSize: knownFullImageSizeMock,
}));

import { attachGalleryLightbox } from "./gallery-lightbox";

const FULL = "https://cdns.grindr.com/rightnow/full/1";
const THUMB = "https://cdns.grindr.com/rightnow/thumb/1";
const THUMB_SIDE = 320;
const SIZE = { width: 1200, height: 1600 };

const detachers: (() => void)[] = [];

function galleryOfOnePhoto() {
	const gallery = document.createElement("div");
	const link = document.createElement("a");
	link.href = FULL;
	const thumbnail = document.createElement("img");
	thumbnail.src = THUMB;
	thumbnail.alt = "Post photo";
	Object.defineProperty(thumbnail, "naturalWidth", { get: () => THUMB_SIDE });
	Object.defineProperty(thumbnail, "naturalHeight", {
		get: () => THUMB_SIDE,
	});
	link.append(thumbnail);
	gallery.append(link);
	document.body.append(gallery);
	return { gallery, link, thumbnail };
}

async function attach({ croppedThumbs }: { croppedThumbs?: boolean }) {
	const { gallery, link, thumbnail } = galleryOfOnePhoto();
	const detach = attachGalleryLightbox({ gallery, croppedThumbs });
	detachers.push(detach);
	await vi.waitFor(() => expect(lightboxes).toHaveLength(1));
	const [lightbox] = lightboxes;
	if (lightbox === undefined) throw new Error("no lightbox");
	return { lightbox, link, thumbnail, detach };
}

const domItem = (link: HTMLAnchorElement) => ({
	element: link,
	src: FULL,
	msrc: THUMB,
	width: 0,
	height: 0,
});

const stayOnPage = (event: Event) => event.preventDefault();

afterEach(() => {
	for (const detach of detachers.splice(0)) detach();
	lightboxes.length = 0;
	window.removeEventListener("click", stayOnPage);
	document.body.replaceChildren();
	vi.clearAllMocks();
});

describe("a gallery lightbox over cropped thumbnails", () => {
	it("waits for the tapped photo's full size before opening, never preloading the cropped thumbnail as the first slide", async () => {
		const size = Promise.withResolvers<MediaDimensions | null>();
		fullImageSizeWithinMock.mockReturnValue(size.promise);
		const { lightbox, thumbnail } = await attach({ croppedThumbs: true });

		thumbnail.click();

		expect(lightbox.options.preloadFirstSlide).toBe(false);
		expect(fullImageSizeWithinMock).toHaveBeenCalledExactlyOnceWith({
			src: FULL,
			timeoutMs: 1500,
		});
		expect(knownFullImageSizeMock).not.toHaveBeenCalled();
		expect(lightbox.pswp).toBeUndefined();
	});

	it("sizes a slide from its decoded full-size photo and zooms from the thumbnail as a crop of it", async () => {
		knownFullImageSizeMock.mockReturnValue(SIZE);
		const { lightbox, link } = await attach({ croppedThumbs: true });

		const item = lightbox.applyFilters("itemData", domItem(link), 0);

		expect(knownFullImageSizeMock).toHaveBeenCalledWith(FULL);
		expect(item).toMatchObject({
			...SIZE,
			src: FULL,
			msrc: FULL,
			thumbCropped: true,
		});
	});

	it("leaves a slide unsized while its full-size photo is unknown, instead of taking the square thumbnail's size", async () => {
		knownFullImageSizeMock.mockReturnValue(null);
		const { lightbox, link } = await attach({ croppedThumbs: true });

		const item = lightbox.applyFilters("itemData", domItem(link), 0);

		expect(item).toMatchObject({ width: 0, height: 0, src: FULL });
		expect(item.thumbCropped).toBeUndefined();
	});

	it("stops following taps on the gallery once detached", async () => {
		window.addEventListener("click", stayOnPage);
		const { lightbox, thumbnail, detach } = await attach({
			croppedThumbs: true,
		});

		detach();
		thumbnail.click();

		await expect(lightbox.options.openPromise?.()).resolves.toBeNull();
		expect(fullImageSizeWithinMock).not.toHaveBeenCalled();
	});
});

describe("a gallery lightbox over whole thumbnails", () => {
	it("opens without waiting and sizes slides from their thumbnails, as chat images do", async () => {
		knownFullImageSizeMock.mockReturnValue(SIZE);
		const { lightbox, link } = await attach({});

		const item = lightbox.applyFilters("itemData", domItem(link), 0);

		expect(lightbox.options.preloadFirstSlide).toBeUndefined();
		expect(lightbox.options.openPromise).toBeUndefined();
		expect(item).toStrictEqual({
			...domItem(link),
			width: THUMB_SIDE,
			height: THUMB_SIDE,
		});
		expect(knownFullImageSizeMock).not.toHaveBeenCalled();
	});
});
