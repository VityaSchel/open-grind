import type { Locator, Page } from "@playwright/test";

import { ACTIVE_PANE } from "../../../e2e/support/profile-pager";
import { ACTIVE_SURFACE, LIGHTBOX } from "../../../e2e/support/video";
import type { Scene } from ".";
import {
	ALBUM_PEER_ID,
	albumMediaUrl,
	ALBUMS_INBOX,
	VIDEO_ALBUM_ID,
} from "./album-fixtures";
import { openConversation } from "./chat-drive";
import { changeScene } from "./drive";
import { CONNECT_FAILED, failChunks } from "./faults";
import { openProfile } from "./profile-drive";
import { addingToast } from "./toast";

const MANY_PHOTOS_ID = 100004;
const MISSING_PHOTO_SEED = `seed=${MANY_PHOTOS_ID}-3`;
const ALBUM_PREVIEW = '[data-slot="album-preview"]';
const ACTIVE_VIDEO = `${ACTIVE_SURFACE} video`;
const ACTIVE_SLIDE = '.pswp__item:not([aria-hidden="true"])';
const NEXT_ARROW = ".pswp__button--arrow--next";
const ZOOM_BUTTON = ".pswp__button--zoom";
const UNDECODABLE_BYTES = "not a video";
const H264 = "avc1";
const ALBUM_VIDEO = albumMediaUrl({ albumId: VIDEO_ALBUM_ID, slot: 2 });

function albumPreview({
	page,
	last = false,
}: {
	page: Page;
	last?: boolean;
}): Locator {
	const previews = page.locator(ALBUM_PREVIEW);
	return last ? previews.last() : previews.first();
}

async function openAlbumConversation(page: Page): Promise<void> {
	await openConversation({ page, withId: ALBUM_PEER_ID });
	await albumPreview({ page }).waitFor();
}

async function openAlbumLightbox(preview: Locator): Promise<void> {
	await preview.dispatchEvent("click");
	await preview.page().locator(LIGHTBOX).waitFor();
}

async function openLastSlide(preview: Locator): Promise<void> {
	await openAlbumLightbox(preview);
	await preview.page().keyboard.press("ArrowLeft");
}

async function showMouseControls(page: Page): Promise<void> {
	await page.evaluate(() => {
		const { pswp } = window as unknown as {
			pswp?: { mouseDetected: () => void };
		};
		pswp?.mouseDetected();
	});
	await page.locator(NEXT_ARROW).waitFor();
	await page.locator(ZOOM_BUTTON).waitFor();
}

async function closeLightbox(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await page.locator(LIGHTBOX).waitFor({ state: "detached" });
}

async function showEndedAlbumVideo(page: Page): Promise<void> {
	await page.keyboard.press("ArrowLeft");
	await page.locator(ACTIVE_VIDEO).waitFor();
	await page.waitForFunction(
		(video) => document.querySelector<HTMLVideoElement>(video)?.ended,
		ACTIVE_VIDEO,
	);
}

async function showPlaying(page: Page): Promise<void> {
	await page.locator(ACTIVE_VIDEO).evaluate((video) => {
		Object.defineProperty(video, "paused", {
			configurable: true,
			get: () => false,
		});
		video.dispatchEvent(new Event("play"));
	});
}

async function serveUndecodableAlbumVideo(page: Page): Promise<void> {
	await page.route(ALBUM_VIDEO, (route) =>
		route.fulfill({ contentType: "video/mp4", body: UNDECODABLE_BYTES }),
	);
}

async function openUndecodableVideo(page: Page): Promise<void> {
	await serveUndecodableAlbumVideo(page);
	await openAlbumConversation(page);
	await openLastSlide(albumPreview({ page }));
	await page.locator(`${ACTIVE_SLIDE} .pswp__error-msg p`).waitFor();
}

async function withoutH264(page: Page): Promise<void> {
	await page.addInitScript((codec) => {
		const canPlayType = HTMLMediaElement.prototype.canPlayType;
		HTMLMediaElement.prototype.canPlayType = function (type) {
			return type.includes(codec) ? "" : canPlayType.call(this, type);
		};
	}, H264);
}

export const profileLightbox: Scene = {
	platform: "phone",
	views: [
		{
			id: "profile/lightbox/load-failed",
			screen: "profile/details",
			drive: async (page) => {
				await page.route(
					(url) => url.href.includes(MISSING_PHOTO_SEED),
					(route) => route.fulfill({ status: 404 }),
				);
				await openProfile({ page, profileId: MANY_PHOTOS_ID });
				await page
					.locator(`${ACTIVE_PANE} .item[href]`)
					.first()
					.click();
				await page.locator(LIGHTBOX).waitFor();
				await page.keyboard.press("ArrowLeft");
				await page
					.locator(`${ACTIVE_SLIDE} .pswp__error-msg[role="img"]`)
					.waitFor();
			},
		},
	],
};

export const albumVideoPlayer: Scene = {
	platform: "phone",
	demo: { inbox: ALBUMS_INBOX },
	views: [
		{
			id: "media/lightbox",
			screen: "chat/conversation",
			drive: async (page) => {
				await openAlbumConversation(page);
				await openAlbumLightbox(albumPreview({ page }));
				await showMouseControls(page);
			},
		},
		{
			id: "media/video-player",
			screen: "chat/conversation",
			drive: showEndedAlbumVideo,
		},
		{
			id: "media/video-player/playing",
			screen: "chat/conversation",
			drive: async (page) => {
				await page
					.locator(ACTIVE_SURFACE)
					.getByRole("button", { name: "Unmute" })
					.dispatchEvent("click");
				await showPlaying(page);
				await page
					.locator(ACTIVE_SURFACE)
					.getByRole("button", { name: "Pause" })
					.waitFor();
			},
		},
		{
			id: "chat/album/no-plays-left",
			screen: "chat/conversation",
			drive: async (page) => {
				await closeLightbox(page);
				await openLastSlide(albumPreview({ page, last: true }));
				await page
					.locator(`${ACTIVE_SLIDE} [data-slot="no-plays-left"]`)
					.waitFor();
			},
		},
	],
};

export const albumPreviewFailures: Scene = {
	platform: "phone",
	demo: {
		inbox: ALBUMS_INBOX,
		restFaults: [
			{
				method: "GET",
				path: `/v2/albums/${VIDEO_ALBUM_ID}`,
				error: CONNECT_FAILED,
			},
		],
	},
	views: [
		{
			id: "chat/album/failures",
			screen: "chat/conversation",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAlbumConversation(page);
				await addingToast({
					page,
					action: () => albumPreview({ page }).click(),
				});
				await changeScene({ page, scene: { restFaults: [] } });
				await failChunks({ page });
				await addingToast({
					page,
					action: () => albumPreview({ page }).click(),
				});
			},
		},
	],
};

export const videoPlayFailed: Scene = {
	platform: "phone",
	demo: { inbox: ALBUMS_INBOX },
	views: [
		{
			id: "media/video-player/play-failed",
			screen: "chat/conversation",
			drive: openUndecodableVideo,
		},
	],
};

export const videoDecoderMissing: Scene = {
	platform: "desktop",
	shim: "linux",
	demo: { inbox: ALBUMS_INBOX },
	views: [
		{
			id: "media/video-player/decoder-missing",
			screen: "chat/conversation/actions-button",
			drive: async (page) => {
				await withoutH264(page);
				await openUndecodableVideo(page);
			},
		},
	],
};
