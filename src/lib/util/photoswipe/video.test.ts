// @vitest-environment jsdom

import PhotoSwipeLightbox from "photoswipe/lightbox";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyPhotoSwipeErrorUi } from "./error-ui";
import { applyPhotoSwipeVideo } from "./video";

vi.mock("$lib/platform/os", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/os")>()),
	isLinuxPlatform: () => true,
}));
vi.mock("$lib/platform/video-codecs", () => ({ canDecodeH264: () => false }));

const VIDEO = '[data-slot="video-player-media"]';
const teardowns: (() => void)[] = [];

afterEach(() => {
	for (const teardown of teardowns.splice(0)) teardown();
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
