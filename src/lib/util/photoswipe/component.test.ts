// @vitest-environment jsdom

import PhotoSwipeLightbox from "photoswipe/lightbox";
import { mount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import VideoPlayer from "$lib/components/shared/VideoPlayer.svelte";
import { applyPhotoSwipeComponent } from "./component";

const VIDEO = '[data-slot="video-player-media"]';
const teardowns: (() => void)[] = [];

afterEach(() => {
	for (const teardown of teardowns.splice(0)) teardown();
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
