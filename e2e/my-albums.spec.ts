import { expect, type Page, test } from "@playwright/test";

import {
	ALBUM_TILE,
	albumTileNamed,
	back,
	MEDIA_SLOT,
	openAlbums,
	openSharedAlbum,
	SHARED_ALBUM,
} from "./support/albums";
import { installTauriShim } from "./support/app";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";

declare global {
	interface Window {
		__addAlbumRendered?: boolean;
	}
}

const ADD_ALBUM = 'a[href="/albums/new"]';

const TINY_PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function createAlbum(page: Page, name: string): Promise<void> {
	await page.getByRole("link", { name: "Add album" }).click();
	await page.getByRole("textbox", { name: "Album name" }).fill(name);
	const chooser = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Add photos or videos" }).click();
	await (
		await chooser
	).setFiles({
		name: "one.png",
		mimeType: "image/png",
		buffer: Buffer.from(TINY_PNG, "base64"),
	});
	await expect(page).toHaveURL(/\/albums\/\d+$/, { timeout: 30_000 });
	await expect(page.locator(MEDIA_SLOT)).toHaveCount(1, { timeout: 30_000 });
}

async function watchAddAlbum(page: Page): Promise<() => Promise<boolean>> {
	await page.evaluate((selector) => {
		window.__addAlbumRendered = false;
		new MutationObserver((records) => {
			const added = records.flatMap((record) => [...record.addedNodes]);
			if (
				added.some(
					(node) =>
						node instanceof Element &&
						(node.matches(selector) ||
							node.querySelector(selector) !== null),
				)
			) {
				window.__addAlbumRendered = true;
			}
		}).observe(document.body, { subtree: true, childList: true });
	}, ADD_ALBUM);
	return () => page.evaluate(() => window.__addAlbumRendered === true);
}

test.describe("my albums", () => {
	test("settings reaches the grid, which reaches one album and the new one", async ({
		page,
	}) => {
		await installTauriShim(page);
		await serveImages(page, CHAT_MEDIA_HOST);
		await page.goto("/settings");

		await page
			.getByRole("link", { name: /My Albums/ })
			.click({ timeout: 60_000 });
		await expect(page).toHaveURL(/\/albums$/);
		await expect(
			page.getByRole("navigation").getByText("My Albums"),
		).toBeVisible();

		const addAlbum = page.getByRole("link", { name: "Add album" });
		await expect(addAlbum, "the add cell leads the grid").toBeVisible();
		await expect(
			page.locator(`${ALBUM_TILE}, a[href="/albums/new"]`).first(),
		).toHaveAttribute("href", "/albums/new");

		await addAlbum.click();
		await expect(page).toHaveURL(/\/albums\/new$/);
		await expect(
			page.getByRole("navigation").getByText("New Album"),
		).toBeVisible();
		await expect(
			page.getByText("Add a photo to start your album"),
			"the new album waits on its first photo",
		).toBeVisible();
		await expect(
			page.getByRole("textbox", { name: "Album name" }),
			"the name is typed before the first photo creates the album",
		).toBeEnabled();
		await expect(
			page.getByRole("button", { name: "Add photos or videos" }),
			"the first photo is added from the empty state",
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Album menu" }),
		).toHaveCount(0);
	});

	test("an album opens on its own name, date and item count", async ({
		page,
	}) => {
		await openAlbums(page);
		await page.locator(SHARED_ALBUM).click();

		await expect(page).toHaveURL(/\/albums\/903$/);
		await expect(
			page.getByRole("navigation").getByText("Edit Album"),
		).toBeVisible();
		await expect(
			page.getByRole("textbox", { name: "Album name" }),
		).toHaveValue("Studio", { timeout: 30_000 });
		await expect(page.getByText("3/10 photos, 0/1 videos")).toBeVisible();
		await expect(page.locator(MEDIA_SLOT)).toHaveCount(3);
	});

	test("a rename reaches the server, not just the field", async ({
		page,
	}) => {
		await openAlbums(page);
		await page.locator(SHARED_ALBUM).click();

		const name = page.getByRole("textbox", { name: "Album name" });
		await expect(name).toHaveValue("Studio", { timeout: 30_000 });
		await name.fill("Darkroom");
		await page.getByRole("button", { name: "Save changes" }).click();

		await back(page);
		await expect(
			page.locator(albumTileNamed("Darkroom")),
			"the grid refetched the album under its new name",
		).toBeVisible({ timeout: 30_000 });
	});

	test("the preview opens the album the way a message does", async ({
		page,
	}) => {
		await openAlbums(page);
		await page.locator(SHARED_ALBUM).click();

		await page
			.getByRole("button", { name: "Preview album" })
			.click({ timeout: 30_000 });
		await expect(page.locator(".pswp")).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(".pswp__img").first()).toBeVisible();
	});

	test("deleting an album confirms first, then walks back to a grid one short", async ({
		page,
	}) => {
		await openAlbums(page);
		const before = await page.locator(ALBUM_TILE).count();
		const atAlbums = await page.evaluate(
			() => navigation.currentEntry!.index,
		);
		await page.locator(SHARED_ALBUM).click();

		await page
			.getByRole("button", { name: "Album menu" })
			.click({ timeout: 30_000 });
		await page.getByRole("menuitem", { name: "Delete album" }).click();
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page).toHaveURL(/\/albums\/903$/);

		await page.getByRole("button", { name: "Album menu" }).click();
		await page.getByRole("menuitem", { name: "Delete album" }).click();
		await page.getByRole("button", { name: "Delete", exact: true }).click();

		await expect(page).toHaveURL(/\/albums$/, { timeout: 30_000 });
		expect(
			await page.evaluate(() => navigation.currentEntry!.index),
			"it walked back to My Albums rather than stacking another",
		).toBe(atAlbums);
		await expect(page.locator(SHARED_ALBUM)).toHaveCount(0);
		await expect(page.locator(ALBUM_TILE)).toHaveCount(before - 1);
	});

	test("a removal is marked, undoable, and only lands on save", async ({
		page,
	}) => {
		await openSharedAlbum(page);
		await expect(page.locator(MEDIA_SLOT)).toHaveCount(3);

		const save = page.getByRole("button", { name: "Save changes" });
		await expect(save, "nothing to save yet").toBeHidden();

		const mark = page.getByRole("button", {
			name: /^Remove album photo in slot 1$/,
		});
		await mark.click();
		await expect(page.getByText("2/10 photos, 0/1 videos")).toBeVisible();
		await expect(
			page.locator(MEDIA_SLOT),
			"the tile stays, marked rather than gone",
		).toHaveCount(3);
		await expect(save).toBeVisible();

		const undo = page.getByRole("button", {
			name: /^Keep album photo in slot 1$/,
		});
		await undo.click();
		await expect(page.getByText("3/10 photos, 0/1 videos")).toBeVisible();
		await expect(save, "undoing everything disarms save").toBeHidden();

		await mark.click();
		await save.click();
		await expect(save).toBeHidden({ timeout: 30_000 });
		await expect(page.locator(MEDIA_SLOT)).toHaveCount(2);

		await back(page);
		await page.locator(SHARED_ALBUM).click();
		await expect(
			page.locator(MEDIA_SLOT),
			"the server kept the removal",
		).toHaveCount(2, { timeout: 30_000 });
	});

	test("leaving the editor abandons pending edits", async ({ page }) => {
		await openSharedAlbum(page);
		await page
			.getByRole("button", { name: /^Remove album photo in slot 1$/ })
			.click();
		await page
			.getByRole("textbox", { name: "Album name" })
			.fill("Scrapped");

		await back(page);
		await page.locator(SHARED_ALBUM).click();

		await expect(page.locator(MEDIA_SLOT)).toHaveCount(3, {
			timeout: 30_000,
		});
		await expect(
			page.getByRole("textbox", { name: "Album name" }),
		).toHaveValue("Studio");
	});

	test("the add cell leaves the grid once the albums reach the cap", async ({
		page,
	}) => {
		await openAlbums(page);
		const below = await page.locator(ALBUM_TILE).count();
		await expect(
			page.getByRole("link", { name: "Add album" }),
			"one album short of the cap, the add cell still leads",
		).toBeVisible();

		await createAlbum(page, "Rooftop");
		const addAlbumRendered = await watchAddAlbum(page);
		await back(page);

		await expect(page.locator(albumTileNamed("Rooftop"))).toBeVisible({
			timeout: 30_000,
		});
		await expect(
			page.locator(ALBUM_TILE),
			"every album still shows at the cap",
		).toHaveCount(below + 1);
		await expect(
			page.getByRole("link", { name: "Add album" }),
			"no room for another album, so no add cell",
		).toHaveCount(0);
		expect(
			await addAlbumRendered(),
			"the add cell never rendered while the grid loaded",
		).toBe(false);
	});
});
