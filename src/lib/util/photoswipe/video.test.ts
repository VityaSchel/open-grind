// @vitest-environment jsdom

import PhotoSwipeLightbox from "photoswipe/lightbox";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { applyPhotoSwipeErrorUi } from "./error-ui";
import { applyPhotoSwipeVideo } from "./video";

vi.mock("#lib/platform/video-codecs.ts", () => ({
	canDecodeH264: () => false,
}));

const VIDEO = '[data-slot="video-player-media"]';
const teardowns: (() => void)[] = [];

beforeEach(() => runningOn("linux"));

afterEach(() => {
	for (const teardown of teardowns.splice(0)) teardown();
	resetPlatform();
});

describe("applyPhotoSwipeVideo", () => {
	it("links the codecs guide when no H.264 decoder is installed", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockReturnValue();
		const lightbox = new PhotoSwipeLightbox({
			dataSource: [{ width: 100, height: 100 }],
			pswpModule: () => import("photoswipe"),
			showHideAnimationType: "none",
		});
		teardowns.push(() => {
			lightbox.destroy();
			vi.restoreAllMocks();
		});
		applyPhotoSwipeErrorUi(lightbox);
		applyPhotoSwipeVideo(lightbox, () => ({
			src: "ogmedia://media/a.mp4",
			poster: null,
		}));
		lightbox.init();
		lightbox.loadAndOpen(0);
		await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));

		document.querySelector(VIDEO)?.dispatchEvent(new Event("loadeddata"));

		const notice = document.querySelector(".pswp__error-msg p");
		const guide = notice?.querySelector("a");
		expect(notice?.textContent).toBe(
			"Playing this video needs an H.264 decoder, which isn’t installed on this system. How to install video codecs",
		);
		expect(guide?.textContent).toBe("How to install video codecs");
		expect(guide?.getAttribute("href")).toBe(
			"https://opengrind.org/guides/codecs",
		);
	});
});
