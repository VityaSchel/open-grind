import type { Page } from "@playwright/test";

import { liveAccounts } from "./support/accounts";
import { albumContentIds, albumLimits, myAlbums } from "./support/albums";
import { liveConversationId, recordLiveConversation } from "./support/chat";
import { cleanersFor, leftoverLiveAlbumIds } from "./support/cleanup";
import { counterpart } from "./support/counterpart";
import { expect, test } from "./support/fixtures";
import { albumContentServerId, type Ledger } from "./support/ledger";
import { uniqueLiveName } from "./support/names";
import { navigateInApp } from "./support/navigation";
import { pickNewestPhoto, pushUniquePhoto } from "./support/photo-picker";

async function openAlbumTile({
	page,
	albumId,
}: {
	page: Page;
	albumId: string;
}) {
	await navigateInApp({ page, path: `/chat/${liveConversationId}` });
	await page.getByRole("button", { name: "Add attachment" }).click();
	await page.getByRole("tab", { name: "Albums" }).click();
	const albums = await myAlbums(page);
	const index = albums.findIndex((album) => album.albumId === albumId);
	expect(index, `album ${albumId} is one of the burner's albums`).not.toBe(
		-1,
	);
	const tiles = page.locator('[data-slot="album-tile"]');
	await expect(tiles).toHaveCount(albums.length);
	return tiles.nth(index);
}

async function pickIntoAlbum(page: Page) {
	await page
		.getByRole("button", { name: "Add photos or videos" })
		.first()
		.click();
	const previousUploads = page.getByRole("dialog", {
		name: "Previous uploads",
	});
	const offersPreviousUploads = await previousUploads
		.waitFor({ timeout: 5000 })
		.then(
			() => true,
			() => false,
		);
	if (offersPreviousUploads) {
		await previousUploads
			.getByRole("button", { name: "Upload photos or videos" })
			.first()
			.click();
	}
	await pickNewestPhoto({ multiple: true });
}

async function shareAndUnshare({
	page,
	albumId,
}: {
	page: Page;
	albumId: string;
}) {
	const unsharedTile = await openAlbumTile({ page, albumId });
	await unsharedTile.click();
	await page.getByRole("button", { name: /^Share/ }).click();
	expect(
		await counterpart.waitForAlbumShare({ albumId, shared: true }),
		"the counterpart sees the shared album",
	).toMatchObject({ settled: true });

	const sharedTile = await openAlbumTile({ page, albumId });
	await sharedTile.click();
	const unshare = page.getByRole("button", { name: /^Unshare/ });
	await unshare.click();
	await expect(unshare).toBeHidden();
	expect(
		await counterpart.waitForAlbumShare({ albumId, shared: false }),
		"the counterpart loses the album",
	).toMatchObject({ settled: true });
}

async function createFillShareAndDelete({
	page,
	ledger,
}: {
	page: Page;
	ledger: Ledger;
}) {
	const name = uniqueLiveName("album");
	await pushUniquePhoto();
	await navigateInApp({ page, path: "/settings/albums/new" });
	await page.getByRole("textbox", { name: "Album name" }).fill(name);
	await pickIntoAlbum(page);
	await expect
		.poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
		.toMatch(/^\/settings\/albums\/\d+$/);
	const albumId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
	ledger.record({
		kind: "album",
		serverId: albumId,
		owner: liveAccounts.app,
		label: name,
	});
	await expect(page.locator('[data-slot="media-slot"]')).toHaveCount(1, {
		timeout: 60_000,
	});

	await shareAndUnshare({ page, albumId });

	await navigateInApp({ page, path: `/settings/albums/${albumId}` });
	await page.getByRole("button", { name: "Album menu" }).click();
	await page.getByRole("menuitem", { name: "Delete album" }).click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	await expect
		.poll(() => leftoverLiveAlbumIds(page), { timeout: 30_000 })
		.not.toContain(albumId);
}

async function fillShareAndRestore({
	page,
	ledger,
	albumId,
}: {
	page: Page;
	ledger: Ledger;
	albumId: string;
}) {
	const original = await albumContentIds({ page, albumId });
	await pushUniquePhoto();
	await navigateInApp({ page, path: `/settings/albums/${albumId}` });
	await pickIntoAlbum(page);

	let added: string[] = [];
	await expect
		.poll(
			async () => {
				added = (await albumContentIds({ page, albumId })).filter(
					(contentId) => !original.includes(contentId),
				);
				return added.length;
			},
			{ timeout: 60_000 },
		)
		.toBeGreaterThan(0);
	const entries = added.map((contentId) =>
		ledger.record({
			kind: "album-content",
			serverId: albumContentServerId({ albumId, contentId }),
			owner: liveAccounts.app,
			label: "unique album photo",
		}),
	);
	expect(added, "exactly the one picked photo joins the album").toHaveLength(
		1,
	);

	await shareAndUnshare({ page, albumId });

	const cleaners = cleanersFor(page);
	for (const entry of entries) {
		await cleaners["album-content"](entry);
		ledger.markCleaned(entry.id);
	}
	await expect
		.poll(async () => (await albumContentIds({ page, albumId })).toSorted())
		.toEqual(original.toSorted());
}

test("an album gets a photo, is shared and unshared, and is put back", async ({
	app,
	ledger,
}) => {
	const [albums, limits] = await Promise.all([
		myAlbums(app),
		albumLimits(app),
	]);
	const roomForAlbum = albums.length < limits.maxAlbums;
	const albumWithRoom = albums.find(
		(album) =>
			album.isShareable &&
			album.content.length < limits.maxContentItemsPerAlbum,
	);
	test.skip(
		!roomForAlbum && albumWithRoom === undefined,
		`The burner is at its ${limits.maxAlbums}-album cap and none of its albums has room for another photo`,
	);

	recordLiveConversation(ledger);
	if (roomForAlbum) {
		await createFillShareAndDelete({ page: app, ledger });
	} else if (albumWithRoom !== undefined) {
		await fillShareAndRestore({
			page: app,
			ledger,
			albumId: albumWithRoom.albumId,
		});
	}
});
