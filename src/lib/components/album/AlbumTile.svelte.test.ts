// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import {
	albumProcessingPlaceholderUrl,
	demoMyAlbums,
} from "$lib/demo/mock/albums";
import type { MyAlbum } from "$lib/model/messaging/albums";
import AlbumTile from "./AlbumTile.svelte";

function demoAlbum(): MyAlbum {
	const [album] = demoMyAlbums().albums;
	if (album === undefined) throw new Error("no demo album");
	return album;
}

function stillProcessing(item: MyAlbum["content"][number]) {
	return {
		...item,
		contentType: "video/mp4",
		coverUrl: albumProcessingPlaceholderUrl,
		statusId: 3,
		thumbUrl: albumProcessingPlaceholderUrl,
		url: albumProcessingPlaceholderUrl,
		processing: true,
	};
}

const COUNT_BADGE = '[data-slot="album-count-badge"]';
const VIDEO_BADGE = '[data-slot="album-video-badge"]';

function tileOf(album: MyAlbum): Element {
	const { container } = render(AlbumTile, {
		props: { album, clickable: false },
	});
	const tile = container.querySelector('[data-slot="album-tile"]');
	if (tile === null) throw new Error("no album tile");
	return tile;
}

function countBadgeText(tile: Element): string | undefined {
	return tile
		.querySelector(COUNT_BADGE)
		?.textContent?.replaceAll(/\s+/g, " ")
		.trim();
}

function coverOf(album: MyAlbum): Element | null {
	return tileOf(album).firstElementChild;
}

afterEach(() => cleanup());

describe("album tile", () => {
	it("shows the same cover as an empty album while every item is processing", () => {
		const album = demoAlbum();
		const processingCover = coverOf({
			...album,
			content: album.content.map(stillProcessing),
		});
		const emptyCover = coverOf({ ...album, content: [] });

		expect(emptyCover?.getAttribute("data-slot")).toBe("broken-media");
		expect(processingCover?.outerHTML).toBe(emptyCover?.outerHTML);
	});

	it("shows a cover image once any item is ready", () => {
		const album = demoAlbum();
		const [first, ...rest] = album.content;
		if (first === undefined) throw new Error("no demo album content");

		expect(
			coverOf({ ...album, content: [stillProcessing(first), ...rest] })
				?.tagName,
		).toBe("IMG");
	});

	it("badges an album with every item processing exactly like an empty album", () => {
		const album = demoAlbum();
		const processing = tileOf({
			...album,
			content: album.content.map(stillProcessing),
		});
		const empty = tileOf({ ...album, content: [] });

		expect(countBadgeText(empty)).toBe("0 0 items");
		expect(empty.querySelector(VIDEO_BADGE)).toBeNull();
		expect(processing.outerHTML).toBe(empty.outerHTML);
	});

	it("counts and badges only the ready items of a partly processed album", () => {
		const album = demoAlbum();
		const [first, second, third] = album.content;
		if (first === undefined || second === undefined || third === undefined)
			throw new Error("demo album has fewer than three items");
		const photos = [
			{ ...first, contentType: "image/jpeg" },
			{ ...third, contentType: "image/jpeg" },
		];
		const readyVideo = tileOf({
			...album,
			content: [...photos, { ...second, contentType: "video/mp4" }],
		});
		const processingVideo = tileOf({
			...album,
			content: [...photos, stillProcessing(second)],
		});

		expect(countBadgeText(readyVideo)).toBe("3 3 items");
		expect(readyVideo.querySelector(VIDEO_BADGE)).not.toBeNull();
		expect(countBadgeText(processingVideo)).toBe("2 2 items");
		expect(processingVideo.querySelector(VIDEO_BADGE)).toBeNull();
	});
});
