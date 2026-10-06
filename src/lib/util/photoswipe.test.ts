// @vitest-environment jsdom

import PhotoSwipeLightbox from "photoswipe/lightbox";
import { flushSync, mount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhotoSwipeModule } from "photoswipe";

import VideoPlayer from "$lib/components/shared/VideoPlayer.svelte";
import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { TRANSPARENT_PIXEL } from "$lib/util/load-when-visible";
import {
	applyPhotoSwipeComponent,
	applyPhotoSwipeErrorUi,
	applyPhotoSwipeLabels,
	applyPhotoSwipeLoadedSize,
	applyPhotoSwipeOpenTracking,
	applyPhotoSwipeThumbDimensions,
	isPhotoSwipeBusy,
	onPhotoSwipeIdle,
	onPhotoSwipeOpening,
} from "./photoswipe";

class FakeCore {
	readonly #destroyListeners: (() => void)[] = [];

	on(name: string, listener: () => void) {
		if (name === "destroy") this.#destroyListeners.push(listener);
	}

	init() {}

	destroy() {
		for (const listener of this.#destroyListeners) listener();
	}
}

const VIDEO = '[data-slot="video-player-media"]';
const teardowns: (() => void)[] = [];

afterEach(() => {
	for (const teardown of teardowns.splice(0)) teardown();
});

function deferredCore() {
	const { promise, resolve, reject } =
		Promise.withResolvers<PhotoSwipeModule>();
	return {
		load: vi.fn(() => promise),
		open: () => resolve(FakeCore as unknown as PhotoSwipeModule),
		fail: reject,
	};
}

function mountLightbox({
	load,
	init = true,
}: {
	load: () => Promise<PhotoSwipeModule>;
	init?: boolean;
}) {
	const gallery = document.createElement("div");
	const item = document.createElement("a");
	item.className = "item";
	item.href = "#photo";
	const photo = document.createElement("img");
	item.append(photo);
	const brokenItem = document.createElement("a");
	brokenItem.className = "item";
	const caption = document.createElement("p");
	gallery.append(item, brokenItem, caption);
	document.body.append(gallery);

	const lightbox = new PhotoSwipeLightbox({
		gallery,
		children: ".item[href]",
		pswpModule: load,
		preloadFirstSlide: false,
	});
	const stop = applyPhotoSwipeOpenTracking(lightbox);
	if (init) lightbox.init();
	teardowns.push(() => {
		lightbox.destroy();
		stop();
		gallery.remove();
	});
	return { lightbox, stop, photo, brokenItem, caption };
}

function listen() {
	const opening = vi.fn();
	const idle = vi.fn(() => isPhotoSwipeBusy());
	teardowns.push(onPhotoSwipeOpening(opening), onPhotoSwipeIdle(idle));
	return { opening, idle };
}

async function openCore(core: ReturnType<typeof deferredCore>) {
	core.open();
	await vi.waitFor(() => expect(window.pswp).toBeInstanceOf(FakeCore));
}

describe("applyPhotoSwipeOpenTracking", () => {
	it("marks a photo click busy before the core module has loaded", () => {
		const core = deferredCore();
		const { photo } = mountLightbox({ load: core.load });
		const { opening } = listen();

		photo.click();

		expect(core.load).toHaveBeenCalledTimes(1);
		expect(window.pswp).toBeUndefined();
		expect(isPhotoSwipeBusy()).toBe(true);
		expect(opening).toHaveBeenCalledTimes(1);
	});

	it("reports idle once the open lightbox is destroyed", async () => {
		const core = deferredCore();
		const { lightbox, photo } = mountLightbox({ load: core.load });
		const { idle } = listen();

		photo.click();
		await openCore(core);
		expect(isPhotoSwipeBusy()).toBe(true);
		expect(idle).not.toHaveBeenCalled();

		lightbox.pswp?.destroy();

		expect(idle).toHaveBeenCalledTimes(1);
		expect(idle).toHaveReturnedWith(false);
		expect(isPhotoSwipeBusy()).toBe(false);
	});

	it("ignores the clicks the lightbox ignores", () => {
		const core = deferredCore();
		const { photo, brokenItem, caption } = mountLightbox({
			load: core.load,
		});
		const { opening } = listen();

		photo.dispatchEvent(
			new MouseEvent("click", { bubbles: true, shiftKey: true }),
		);
		photo.dispatchEvent(
			new MouseEvent("click", { bubbles: true, button: 1 }),
		);
		brokenItem.click();
		caption.click();

		expect(core.load).not.toHaveBeenCalled();
		expect(isPhotoSwipeBusy()).toBe(false);
		expect(opening).not.toHaveBeenCalled();
	});

	it("ignores photo clicks while the lightbox is open", async () => {
		const core = deferredCore();
		const { photo } = mountLightbox({ load: core.load });
		const { opening } = listen();

		photo.click();
		await openCore(core);
		photo.click();

		expect(opening).toHaveBeenCalledTimes(1);
	});

	it("reports idle when the core module fails to load", async () => {
		const core = deferredCore();
		const { lightbox, photo } = mountLightbox({
			load: core.load,
			init: false,
		});
		const { idle } = listen();
		const failure = new Error("chunk failed to load");

		photo.click();
		expect(isPhotoSwipeBusy()).toBe(true);
		const loading = (
			lightbox.options.pswpModule as () => Promise<PhotoSwipeModule>
		)();
		core.fail(failure);

		await expect(loading).rejects.toBe(failure);
		expect(idle).toHaveBeenCalledTimes(1);
		expect(isPhotoSwipeBusy()).toBe(false);
	});

	it("reports idle when stopped before the core module has loaded", () => {
		const core = deferredCore();
		const { lightbox, stop, photo } = mountLightbox({ load: core.load });
		const { idle } = listen();

		photo.click();
		lightbox.destroy();
		stop();

		expect(idle).toHaveBeenCalledTimes(1);
		expect(isPhotoSwipeBusy()).toBe(false);
	});
});

describe("applyPhotoSwipeComponent", () => {
	it("unmounts its slides when the lightbox closes", async () => {
		const lightbox = new PhotoSwipeLightbox({
			dataSource: [{ width: 100, height: 100 }],
			pswpModule: () => import("photoswipe"),
			showHideAnimationType: "none",
		});
		teardowns.push(() => lightbox.destroy());
		const slides: HTMLElement[] = [];
		applyPhotoSwipeComponent(lightbox, {
			slideAt: () => ({ src: "ogmedia://media/a.mp4", poster: null }),
			render: ({ target, slide }) => {
				slides.push(target);
				return mount(VideoPlayer, { target, props: slide });
			},
		});
		lightbox.init();
		lightbox.loadAndOpen(0);
		await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));
		expect(slides).toHaveLength(1);
		expect(slides[0]?.querySelector(VIDEO)).not.toBeNull();

		lightbox.pswp?.close();
		await vi.waitFor(() => expect(lightbox.pswp).toBeUndefined());

		expect(slides[0]?.querySelector(VIDEO)).toBeNull();
	});
});

describe("applyPhotoSwipeLabels", () => {
	let opened: PhotoSwipeLightbox | undefined;

	afterEach(async () => {
		opened?.pswp?.close();
		await vi.waitFor(() => expect(window.pswp).toBeUndefined());
		await setLocale({ locale: SOURCE_LOCALE });
	});

	async function openLabeled() {
		const lightbox = new PhotoSwipeLightbox({
			dataSource: [
				{ src: "a.jpg", width: 100, height: 100 },
				{ src: "b.jpg", width: 100, height: 100 },
			],
			pswpModule: () => import("photoswipe"),
			showHideAnimationType: "none",
		});
		teardowns.push(() => lightbox.destroy());
		opened = lightbox;
		applyPhotoSwipeErrorUi(lightbox);
		applyPhotoSwipeLabels(lightbox);
		lightbox.init();
		lightbox.loadAndOpen(0);
		await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));
		return lightbox;
	}

	const buttonLabels = () =>
		["close", "zoom", "arrow--prev", "arrow--next"].map((name) => {
			const button = document.querySelector(`.pswp__button--${name}`);
			return [
				button?.getAttribute("title"),
				button?.getAttribute("aria-label"),
			];
		});

	const translatedLabels = () =>
		[
			t("common.actions.close"),
			t("media.lightbox.zoom"),
			t("media.lightbox.previous"),
			t("media.lightbox.next"),
		].map((title) => [title, title]);

	const errorLabel = () =>
		document
			.querySelector(".pswp__error-msg[role=img]")
			?.getAttribute("aria-label");

	it("titles the buttons in the locale the lightbox opens in", async () => {
		await setLocale({ locale: "en-XA" });
		await openLabeled();

		expect(buttonLabels()).toEqual(translatedLabels());
		expect(buttonLabels()[0]?.[0]).not.toBe("Close");
	});

	it("retitles the open lightbox when the locale switches", async () => {
		await openLabeled();
		expect(buttonLabels()).toEqual([
			["Close", "Close"],
			["Zoom", "Zoom"],
			["Previous", "Previous"],
			["Next", "Next"],
		]);

		await setLocale({ locale: "en-XA" });
		flushSync();

		expect(buttonLabels()).toEqual(translatedLabels());
		expect(buttonLabels()[0]?.[0]).not.toBe("Close");
	});

	it("relabels a shown load error when the locale switches", async () => {
		const lightbox = await openLabeled();
		lightbox.pswp?.currSlide?.content.onError();
		expect(errorLabel()).toBe("Media failed to load");

		await setLocale({ locale: "en-XA" });
		flushSync();

		expect(errorLabel()).toBe(t("media.lightbox.errors.loadFailed"));
		expect(errorLabel()).not.toBe("Media failed to load");
	});
});

describe("applyPhotoSwipeThumbDimensions", () => {
	function thumbnailItem({ src, size }: { src: string; size: number }) {
		const element = document.createElement("a");
		const thumbnail = document.createElement("img");
		thumbnail.src = src;
		Object.defineProperty(thumbnail, "naturalWidth", { get: () => size });
		Object.defineProperty(thumbnail, "naturalHeight", { get: () => size });
		element.append(thumbnail);
		return { element, width: 600, height: 800 };
	}

	function sized(item: ReturnType<typeof thumbnailItem>) {
		const lightbox = new PhotoSwipeLightbox({});
		applyPhotoSwipeThumbDimensions(lightbox);
		return lightbox.applyFilters("itemData", item, 0);
	}

	it("sizes the slide from a loaded thumbnail", () => {
		expect(
			sized(thumbnailItem({ src: "https://cdn.test/a.jpg", size: 320 })),
		).toMatchObject({ width: 320, height: 320 });
	});

	it("keeps the known size while the thumbnail still shows the placeholder pixel", () => {
		expect(
			sized(thumbnailItem({ src: TRANSPARENT_PIXEL, size: 1 })),
		).toMatchObject({ width: 600, height: 800 });
	});
});

describe("applyPhotoSwipeLoadedSize", () => {
	function slideAndContent({
		width,
		element,
	}: {
		width: number;
		element: HTMLElement;
	}) {
		const slide = {
			width,
			height: width,
			currentResolution: 1,
			calculateSize: vi.fn(),
			zoomAndPanToInitial: vi.fn(),
			applyCurrentZoomPan: vi.fn(),
			updateContentSize: vi.fn(),
		};
		return { slide, content: { width, height: width, element } };
	}

	function photo({ width, height }: { width: number; height: number }) {
		const image = document.createElement("img");
		Object.defineProperty(image, "naturalWidth", { get: () => width });
		Object.defineProperty(image, "naturalHeight", { get: () => height });
		return image;
	}

	function loaded(event: ReturnType<typeof slideAndContent>) {
		const lightbox = new PhotoSwipeLightbox({});
		applyPhotoSwipeLoadedSize(lightbox);
		lightbox.dispatch("loadComplete", event as never);
		return event;
	}

	it("sizes an unsized photo slide once its photo has loaded", () => {
		const { slide, content } = loaded(
			slideAndContent({
				width: 0,
				element: photo({ width: 1200, height: 900 }),
			}),
		);

		expect([content.width, content.height]).toEqual([1200, 900]);
		expect([slide.width, slide.height]).toEqual([1200, 900]);
		expect(slide.updateContentSize).toHaveBeenCalledWith(true);
	});

	it("leaves a slide alone that already had a size or is not a photo", () => {
		const sized = loaded(
			slideAndContent({
				width: 300,
				element: photo({ width: 1200, height: 900 }),
			}),
		);
		const component = loaded(
			slideAndContent({
				width: 0,
				element: document.createElement("div"),
			}),
		);

		expect(sized.content.width).toBe(300);
		expect(component.content.width).toBe(0);
		expect(sized.slide.updateContentSize).not.toHaveBeenCalled();
		expect(component.slide.updateContentSize).not.toHaveBeenCalled();
	});

	it("shows no placeholder for a slide whose size is not known yet", () => {
		const lightbox = new PhotoSwipeLightbox({});
		applyPhotoSwipeLoadedSize(lightbox);
		const placeholder = (width: number) =>
			lightbox.applyFilters("useContentPlaceholder", true, {
				width,
			} as never);

		expect(placeholder(0)).toBe(false);
		expect(placeholder(300)).toBe(true);
	});
});
