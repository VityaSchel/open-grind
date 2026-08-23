import { expect, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";
import {
	ALBUM_TILE,
	DRAWER,
	MEDIA_TILE,
	openAttachments,
	SELECTED_ALBUM_TILE,
	SHARED_ALBUM_TILE,
	UNSHARED_ALBUM_TILE,
} from "./support/drawer";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";
import { expectNoToast } from "./support/toast";

const OTHER_CONVERSATION = "/chat/100009:123456000";
const LOCKED_ALBUM_MESSAGE = '[data-slot="locked-album"]';

test.describe("composer albums tab", () => {
	test("each tab arms its own action from its own selection", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		await page.getByRole("tab", { name: "Albums" }).click();
		await expect(page.locator(SHARED_ALBUM_TILE)).toHaveCount(2, {
			timeout: 30_000,
		});
		await expect(
			page.locator(`${ALBUM_TILE}[disabled]`),
			"a non-shareable album cannot be picked",
		).toHaveCount(1);

		const share = page.getByRole("button", { name: /^Share/ });
		await page.locator(UNSHARED_ALBUM_TILE).first().click();
		await expect(share, "albums are shared, not sent").toBeVisible();
		await expect(page.getByRole("button", { name: /^Send/ })).toBeHidden();

		await page.getByRole("tab", { name: "Media" }).click();
		await expect(
			share,
			"an album selection must not arm the media tab",
		).toBeHidden();

		await page.getByRole("tab", { name: "Albums" }).click();
		await expect(share).toBeVisible();

		await share.click();
		await expect(page.locator(DRAWER)).toBeHidden();

		await expectNoToast(page, "Couldn't share album");
	});

	test("already shared albums are badged and unshare instead", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		await page.getByRole("tab", { name: "Albums" }).click();
		const shared = page.locator(SHARED_ALBUM_TILE);
		await expect(
			shared,
			"the demo shares two albums with this conversation",
		).toHaveCount(2, { timeout: 30_000 });

		const unshare = page.getByRole("button", { name: /^Unshare/ });
		await shared.first().click();
		await expect(unshare).toBeVisible();
		await expect(page.getByRole("button", { name: /^Share/ })).toBeHidden();

		await shared.nth(1).click();
		await expect(
			unshare,
			"both shared albums unshare in one action",
		).toHaveAccessibleName(/^Unshare\s*2$/);

		await unshare.click();
		await expect(
			page.locator(DRAWER),
			"unsharing keeps the drawer open to show the result",
		).toBeVisible();
		await expect(unshare).toBeHidden();
		await expectNoToast(page, "Couldn't unshare album");
		await expect(
			page.locator(SHARED_ALBUM_TILE),
			"an unshared album loses its badge",
		).toHaveCount(0);
		await expect(
			page.locator(ALBUM_TILE).first(),
			"tiles unlock once the requests settle",
		).toBeEnabled();
		await expect(
			page.locator(LOCKED_ALBUM_MESSAGE),
			"the album we sent earlier in this chat locks",
		).toHaveCount(1);

		await page.locator(UNSHARED_ALBUM_TILE).nth(1).click();
		await page.getByRole("button", { name: /^Share/ }).click();
		await expect(page.locator(DRAWER)).toBeHidden();
		await expect(
			page.locator(LOCKED_ALBUM_MESSAGE),
			"sharing it again unlocks the sent album",
		).toHaveCount(0);
	});

	test("a selection cannot mix shared and unshared albums", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		await page.getByRole("tab", { name: "Albums" }).click();
		const shared = page.locator(SHARED_ALBUM_TILE);
		const unshared = page.locator(UNSHARED_ALBUM_TILE);
		await expect(shared).toHaveCount(2, { timeout: 30_000 });
		await expect(unshared.first()).toBeEnabled();

		await unshared.first().click();
		await expect(
			shared.first(),
			"a shared album cannot join a share selection",
		).toBeDisabled();
		await expect(shared.first()).toHaveCSS("opacity", "0.5");

		await unshared.first().click();
		await expect(
			shared.first(),
			"clearing the selection unlocks both kinds again",
		).toBeEnabled();
		await expect(shared.first()).toHaveCSS("opacity", "1");

		await shared.first().click();
		await expect(
			unshared.first(),
			"an unshared album cannot join an unshare selection",
		).toBeDisabled();
		await expect(unshared.first()).toHaveCSS("opacity", "0.5");
		await expect(
			page.locator(SELECTED_ALBUM_TILE),
			"and the incompatible tiles stay unselected",
		).toHaveCount(1);
	});

	test("a conversation change closes the armed drawer", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await serveImages(page, CHAT_MEDIA_HOST);
		await installTauriShim(page);

		await page.goto(DEMO_CONVERSATION);
		await page.waitForTimeout(2500);
		await page.locator(`a[href='${OTHER_CONVERSATION}']`).first().click();
		await page.waitForTimeout(2000);
		expect(page.url()).toContain(OTHER_CONVERSATION);

		await page.getByRole("button", { name: "Add attachment" }).click();
		await page.locator(DRAWER).waitFor({ timeout: 10_000 });
		await page.getByRole("tab", { name: "Albums" }).click();
		const tiles = page.locator(ALBUM_TILE);
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
		await tiles.first().click();

		const share = page.getByRole("button", { name: /^Share|^Unshare/ });
		await expect(share).toBeVisible();

		await page.goBack();
		await expect(page).toHaveURL(new RegExp(`${DEMO_CONVERSATION}$`));
		await expect(
			page.locator(DRAWER),
			"a selection armed for the previous conversation must not survive",
		).toBeHidden();
		await expect(share).toBeHidden();
	});

	test("closing the drawer forgets the selection it was armed with", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		await page.getByRole("tab", { name: "Albums" }).click();
		const tiles = page.locator(ALBUM_TILE);
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });

		const share = page.getByRole("button", { name: /^Share|^Unshare/ });
		await tiles.first().click();
		await expect(share).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(page.locator(DRAWER)).toBeHidden();
		await page.getByRole("button", { name: "Add attachment" }).click();
		await expect(page.locator(DRAWER)).toBeVisible();
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });

		await expect(
			page.locator(SELECTED_ALBUM_TILE),
			"the reopened tab starts with nothing selected",
		).toHaveCount(0);
		await expect(
			share,
			"so the action must not still be armed from the closed drawer",
		).toBeHidden();
	});

	test("album tiles are taller than the square media tiles", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		const ratio = async (selector: string) => {
			const box = await page.locator(selector).first().boundingBox();
			if (box === null) throw new Error(`no tile for ${selector}`);
			return box.width / box.height;
		};

		await expect(page.locator(MEDIA_TILE).first()).toBeVisible({
			timeout: 30_000,
		});
		expect(await ratio(MEDIA_TILE)).toBeCloseTo(1, 1);

		await page.getByRole("tab", { name: "Albums" }).click();
		await expect(page.locator(ALBUM_TILE).first()).toBeVisible({
			timeout: 30_000,
		});
		expect(await ratio(ALBUM_TILE)).toBeCloseTo(0.75, 1);
	});
});
