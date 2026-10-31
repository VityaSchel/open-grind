import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";
import { ACTIVE_SURFACE, CONTROLS } from "./support/video";

test("an inline album reply sends the selected item and preserves the chat draft", async ({
	page,
}) => {
	await serveImages(page, CHAT_MEDIA_HOST);
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
	await page.goto("/chat/100006:123456000");
	await page.getByRole("textbox").fill("Existing chat draft");
	await page
		.getByRole("button", { name: "Open album", exact: true })
		.last()
		.click();
	const dialog = page.getByRole("dialog");
	const replyBox = dialog.getByRole("textbox", {
		name: "Reply to album item",
	});
	await expect(replyBox).toBeEnabled();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
	const replyBounds = await replyBox.boundingBox();
	expect(replyBounds!.y).toBeGreaterThan(page.viewportSize()!.height * 0.75);
	await replyBox.fill("Love the second photo");
	await dialog.getByRole("button", { name: "Send reply" }).click();
	await expect(dialog).toHaveCount(0);
	await expect(page.getByRole("textbox")).toHaveValue("Existing chat draft");
	const sentReply = page
		.getByRole("article")
		.filter({ hasText: "Love the second photo" });
	await expect(sentReply).toBeVisible();
	await expect(
		sentReply.locator('[data-slot="message-quote"]'),
	).toBeVisible();
	await sentReply
		.getByRole("button", { name: "Open replied album content" })
		.click();
	await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
	await expect(
		dialog.getByRole("textbox", { name: "Reply to album item" }),
	).toBeEnabled();
	await dialog.getByRole("button", { name: "Close", exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect(page.getByRole("textbox")).toHaveValue("Existing chat draft");
	await page.getByRole("textbox").fill("");
	await page.getByRole("link", { name: "Back to chats" }).click();
	await expect(
		page.getByRole("link", { name: /theo.*Love the second photo/ }),
	).toBeVisible();
});

test("album video controls stay above the inline reply field", async ({
	page,
}) => {
	await installTauriShim(page);
	await serveImages(page, CHAT_MEDIA_HOST);
	await serveImages(page, AVATAR_HOST);
	await page.route("**/picsum.photos/seed/album-5001-2/600/800", () => {});
	await page.goto("/chat/100001:123456000");
	await page
		.getByRole("button", { name: "Open album", exact: true })
		.first()
		.click();
	const dialog = page.getByRole("dialog");
	const reply = dialog.getByRole("textbox", { name: "Reply to album item" });
	await expect(reply).toBeEnabled();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByText("3 / 3", { exact: true })).toBeVisible();
	const surface = page.locator(ACTIVE_SURFACE);
	await expect(surface).toBeVisible();
	await surface.hover();
	const controls = page.locator(CONTROLS);
	await expect(controls).toBeVisible();
	await expect
		.poll(async () => {
			const bar = await controls.boundingBox();
			const input = await reply.boundingBox();
			return !!bar && !!input && bar.y + bar.height <= input.y;
		})
		.toBe(true);
	const videoBounds = await surface.boundingBox();
	const composerBounds = await page
		.locator(".pswp__reply-composer")
		.boundingBox();
	expect(videoBounds!.y + videoBounds!.height).toBeLessThanOrEqual(
		composerBounds!.y + 1,
	);
	await reply.fill("Nice video");
	await dialog.getByRole("button", { name: "Send reply" }).click();
	await expect(dialog).toHaveCount(0);
	await expect(
		page.getByRole("article").filter({ hasText: "Nice video" }),
	).toBeVisible();
});
