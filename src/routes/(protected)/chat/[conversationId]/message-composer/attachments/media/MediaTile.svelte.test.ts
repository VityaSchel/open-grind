// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import type { DrawerMedia } from "$lib/api/messaging/drawer";
import MediaTile from "./MediaTile.svelte";

const PREVIEW = '[data-slot="video-preview"]';
const VIDEO_BADGE = '[data-slot="media-tile-video-badge"]';

const photo: DrawerMedia = {
	id: 800_001,
	url: `https://cdns.grindr.com/images/chat/${"a".repeat(64)}`,
	contentType: "image/jpeg",
	createdTs: 1_700_000_000_000,
	used: false,
	takenOnGrindr: true,
};

const video: DrawerMedia = {
	...photo,
	id: 800_002,
	url: "https://cdns.grindr.com/videos/chat/clip.mp4",
	contentType: "video/mp4",
};

function renderTile(item: DrawerMedia) {
	return render(MediaTile, {
		props: {
			item,
			index: 2,
			selected: false,
			clickable: true,
			onclick: () => {},
		},
	});
}

afterEach(() => cleanup());

describe("composer media tile", () => {
	it("shows a video as a muted, paused preview marked as video", () => {
		const { getByRole, container } = renderTile(video);

		expect(getByRole("button", { name: "Video 3" })).toBeTruthy();
		const preview = container.querySelector<HTMLVideoElement>(PREVIEW);
		expect(preview?.src).toBe(`${video.url}#t=0.001`);
		expect(preview?.muted).toBe(true);
		expect(preview?.autoplay).toBe(false);
		expect(preview?.preload).toBe("metadata");
		expect(container.querySelector(VIDEO_BADGE)).not.toBeNull();
	});

	it("keeps a photo as an image without the video badge", () => {
		const { getByRole, container } = renderTile(photo);

		expect(getByRole("button", { name: "Photo 3" })).toBeTruthy();
		expect(container.querySelector(PREVIEW)).toBeNull();
		expect(container.querySelector(VIDEO_BADGE)).toBeNull();
	});
});
