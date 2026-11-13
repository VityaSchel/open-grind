// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { isPhotoSwipeBusy, openLightbox } from ".";

const PHOTO = {
	src: "https://example.invalid/photo.jpg",
	width: 600,
	height: 800,
};
const teardowns: (() => void)[] = [];

afterEach(async () => {
	for (const teardown of teardowns.splice(0)) teardown();
	await vi.waitFor(() => expect(window.pswp).toBeUndefined());
});

function openPhoto({
	configure,
}: { configure?: (lightbox: PhotoSwipeLightbox) => void } = {}) {
	const controller = new AbortController();
	teardowns.push(() => controller.abort());
	const onClosed = vi.fn();
	let lightbox: PhotoSwipeLightbox | undefined;
	const opening = openLightbox({
		items: [PHOTO],
		signal: controller.signal,
		onClosed,
		configure: (created) => {
			lightbox = created;
			created.options.showHideAnimationType = "none";
			configure?.(created);
		},
	});
	return { opening, controller, onClosed, lightbox: () => lightbox };
}

describe("openLightbox", () => {
	it("keeps PhotoSwipe busy from the call until the viewer has closed", async () => {
		const { opening, onClosed, lightbox } = openPhoto();
		expect(isPhotoSwipeBusy()).toBe(true);
		await opening;
		await vi.waitFor(() =>
			expect(lightbox()?.pswp?.opener.isOpen).toBe(true),
		);
		expect(isPhotoSwipeBusy()).toBe(true);

		lightbox()?.pswp?.close();

		await vi.waitFor(() => expect(lightbox()?.pswp).toBeUndefined());
		expect(onClosed).toHaveBeenCalledOnce();
		expect(isPhotoSwipeBusy()).toBe(false);
	});

	it("frees PhotoSwipe when called off before PhotoSwipe has loaded", async () => {
		const { opening, controller, lightbox } = openPhoto();
		controller.abort();
		await opening;
		expect(lightbox()).toBeUndefined();
		expect(isPhotoSwipeBusy()).toBe(false);
	});

	it("frees PhotoSwipe and rethrows when configuring the lightbox fails", async () => {
		const failure = new Error("configure failed");
		const { opening } = openPhoto({
			configure: () => {
				throw failure;
			},
		});
		await expect(opening).rejects.toBe(failure);
		expect(isPhotoSwipeBusy()).toBe(false);
	});

	it("frees PhotoSwipe and opens nothing when called off before the viewer opens", async () => {
		const { opening, controller, lightbox } = openPhoto();
		await opening;
		expect(lightbox()?.pswp).toBeUndefined();
		expect(isPhotoSwipeBusy()).toBe(true);

		controller.abort();

		expect(isPhotoSwipeBusy()).toBe(false);
		await new Promise((resolve) => setTimeout(resolve));
		expect(lightbox()?.pswp).toBeUndefined();
	});

	it("treats an open refused because another viewer is on screen as closed, keeping nothing busy", async () => {
		const first = openPhoto();
		await first.opening;
		await vi.waitFor(() =>
			expect(first.lightbox()?.pswp?.opener.isOpen).toBe(true),
		);

		const refused = openPhoto();
		await refused.opening;

		expect(refused.onClosed).toHaveBeenCalledOnce();
		expect(refused.lightbox()?.pswp).toBeUndefined();
		first.controller.abort();
		await vi.waitFor(() => expect(isPhotoSwipeBusy()).toBe(false));
	});
});

describe("openLightbox when PhotoSwipe's core fails to load", () => {
	afterEach(() => {
		vi.doUnmock("photoswipe");
		vi.resetModules();
	});

	it("rejects and frees PhotoSwipe, so the caller can recover", async () => {
		vi.resetModules();
		vi.doMock("photoswipe", () => {
			throw new Error("chunk failed to load");
		});
		const photoswipe = await import(".");
		const onClosed = vi.fn();

		await expect(
			photoswipe.openLightbox({
				items: [PHOTO],
				signal: new AbortController().signal,
				onClosed,
			}),
		).rejects.toThrow();
		expect(photoswipe.isPhotoSwipeBusy()).toBe(false);
		expect(onClosed).not.toHaveBeenCalled();
	});
});
