// @vitest-environment jsdom

import PhotoSwipeLightbox from "photoswipe/lightbox";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhotoSwipeModule } from "photoswipe";

import {
	applyPhotoSwipeOpenTracking,
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
