// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import {
	albumProcessingPlaceholderUrl,
	demoMyAlbums,
} from "$lib/demo/mock/albums";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import {
	bracketCounts,
	restoreCountFormatter,
} from "$lib/i18n/fixtures/count-formatter";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { untranslatableTexts } from "$lib/test/untranslatable";
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

const BROKEN = '[data-slot="broken-media"]';
const COUNT_BADGE = '[data-slot="album-count-badge"]';
const VIDEO_BADGE = '[data-slot="album-video-badge"]';
const SHARED_BADGE = '[data-slot="album-shared-badge"]';
const LOCKED = '[data-slot="album-locked"]';
const NAME_BADGE = '[data-slot="badge"]';

function tileOf(
	album: MyAlbum,
	{ shared = false, shareLocked = false } = {},
): Element {
	const { container } = render(AlbumTile, {
		props: { album, clickable: false, shared, shareLocked },
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

function textOf(element: Element | null): string | undefined {
	return element?.textContent?.trim();
}

afterEach(async () => {
	cleanup();
	restoreCountFormatter();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("album tile", () => {
	it("shows the same cover as an empty album while every item is processing", () => {
		const album = demoAlbum();
		const processingCover = coverOf({
			...album,
			content: album.content.map(stillProcessing),
		});
		const emptyCover = coverOf({ ...album, content: [] });

		expect(emptyCover?.getAttribute("data-slot")).toBe("empty-media");
		expect(processingCover?.outerHTML).toBe(emptyCover?.outerHTML);
	});

	it("never shows the broken image icon for an album with nothing ready", () => {
		const album = demoAlbum();
		const empty = tileOf({ ...album, content: [] });
		const processing = tileOf({
			...album,
			content: album.content.map(stillProcessing),
		});

		expect(empty.querySelector(BROKEN)).toBeNull();
		expect(processing.querySelector(BROKEN)).toBeNull();
	});

	it("shows the broken image icon when a ready cover fails to load", async () => {
		const tile = tileOf(demoAlbum());
		const cover = tile.querySelector("img");
		if (cover === null) throw new Error("no cover image");

		await fireEvent.error(cover);

		expect(tile.querySelector(BROKEN)).not.toBeNull();
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

	it("keeps an album's name out of page translation but not the fallback or badges", () => {
		const album = { ...demoAlbum(), albumName: "Studio" };
		const named = tileOf(album);

		expect(named.textContent).toContain("Studio");
		expect(untranslatableTexts(named)).toEqual(["Studio"]);
		cleanup();

		const untitled = tileOf({ ...album, albumName: null });

		expect(untitled.textContent).toContain("Untitled Album");
		expect(untranslatableTexts(untitled)).toEqual([]);
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

	it("prints both counts of the count badge with the count formatter", () => {
		const bracketed = bracketCounts();
		const album = demoAlbum();
		const ready = album.content.filter((item) => !item.processing).length;

		expect(countBadgeText(tileOf(album))).toBe(
			`${bracketed(ready)} ${bracketed(ready)} items`,
		);
	});

	it("words its badges and screen reader texts in the active locale", async () => {
		const album = demoAlbum();
		const [first] = album.content;
		if (first === undefined) throw new Error("no demo album content");
		const named = { ...album, albumName: "Studio" };
		const video = { ...first, contentType: "video/mp4", processing: false };
		const shared = tileOf({ ...named, content: [video] }, { shared: true });
		const locked = tileOf(
			{ ...album, albumName: null },
			{ shareLocked: true },
		);
		expect(textOf(shared.querySelector(SHARED_BADGE))).toBe("Shared");
		expect(textOf(shared.querySelector(VIDEO_BADGE))).toBe(
			"Contains video",
		);
		expect(textOf(locked.querySelector(LOCKED))).toBe("Can’t be shared");

		await setLocale({ locale: "en-XA" });

		for (const text of [
			textOf(shared.querySelector(SHARED_BADGE)),
			textOf(shared.querySelector(VIDEO_BADGE)),
			textOf(shared.querySelector(`${COUNT_BADGE} .sr-only`)),
			textOf(locked.querySelector(LOCKED)),
			textOf(locked.querySelector(NAME_BADGE)),
		]) {
			expect(text).toMatch(PSEUDO_MESSAGE);
		}
		expect(textOf(shared.querySelector(NAME_BADGE))).toBe("Studio");
		expect(untranslatableTexts(shared)).toEqual(["Studio"]);
	});
});
