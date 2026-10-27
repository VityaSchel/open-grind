import { expect, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";
import { sendInsets } from "./support/keyboard";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";

test.beforeEach(async ({ page }) => {
	test.setTimeout(180_000);
	await serveImages(page, CHAT_MEDIA_HOST);
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
});

test("sends replies from the selected profile photo and keeps the chat draft", async ({
	page,
}) => {
	await page.goto(DEMO_CONVERSATION);
	await page.getByRole("textbox").fill("Existing chat draft");
	await page
		.getByRole("navigation", { name: "Conversation", exact: true })
		.getByRole("link")
		.filter({ has: page.locator('[data-slot="card-title"]') })
		.click();
	const photo = page.getByRole("link", { name: /Profile photo 2 of/ });
	await photo.scrollIntoViewIfNeeded();
	const src = await photo.getAttribute("href");
	await photo.click();
	await page
		.getByRole("textbox", { name: "Reply to profile photo" })
		.fill("  Nice profile photo!  ");
	await page.getByRole("button", { name: "Send reply", exact: true }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(page.getByText("Message sent", { exact: true })).toBeVisible();
	await expect(page).toHaveURL(/\/profile\/100001$/);
	await page
		.getByRole("link", { name: "Write a message...", exact: true })
		.click();
	await expect(page.getByRole("textbox")).toHaveValue("Existing chat draft");
	const reply = page
		.getByRole("article")
		.filter({ hasText: "Nice profile photo!" });
	await expect(reply).toBeVisible();
	await expect(reply.locator('[data-slot="message-quote"]')).toBeVisible();
	await expect(
		reply
			.getByRole("button", { name: "Open replied profile photo" })
			.getByRole("presentation"),
	).toHaveAttribute("src", src!);
	const quotedPhoto = reply.getByRole("button", {
		name: "Open replied profile photo",
	});
	await quotedPhoto.click();
	const replyBox = page.getByRole("textbox", {
		name: "Reply to profile photo",
	});
	await replyBox.fill("Another photo reply");
	await replyBox.press("Enter");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(quotedPhoto).toBeEnabled();
	await expect(quotedPhoto).not.toBeFocused();
	expect(
		await quotedPhoto.evaluate((photo) => photo.matches(":focus-visible")),
	).toBe(false);
	await expect(
		page.getByRole("article").filter({ hasText: "Another photo reply" }),
	).toBeVisible();
	await expect(page.getByRole("textbox")).toHaveValue("Existing chat draft");
});

test("sends the profile photo reply without leaving the profile", async ({
	page,
}) => {
	await page.goto("/profile/100001");
	await page.getByRole("link", { name: /Profile photo 1 of/ }).click();
	await page
		.getByRole("textbox", { name: "Reply to profile photo" })
		.fill("Hello from your photo");
	await page.getByRole("button", { name: "Send reply", exact: true }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(page.getByText("Message sent", { exact: true })).toBeVisible();
	await expect(page).toHaveURL(/\/profile\/100001$/);
	await page
		.getByRole("link", { name: "Write a message...", exact: true })
		.click();
	await expect(
		page.getByRole("article").filter({ hasText: "Hello from your photo" }),
	).toBeVisible();
});

test("incoming replies display our photo and text without offering a reply to our own picture", async ({
	page,
}) => {
	await page.goto("/chat/100006:123456000");
	const reply = page
		.getByRole("article")
		.filter({ hasText: "Great profile photo!" });
	await expect(reply).toBeVisible();
	await reply
		.getByRole("button", { name: "Open replied profile photo" })
		.click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await expect(
		page.getByRole("textbox", { name: "Reply to profile photo" }),
	).toHaveCount(0);
});

test("our profile photo viewer does not offer replies", async ({ page }) => {
	await page.goto("/profile/123456000");
	await page.getByRole("link", { name: /Profile photo 1 of/ }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await expect(
		page.getByRole("textbox", { name: "Reply to profile photo" }),
	).toHaveCount(0);
});

test("the profile reply composer matches the date gradient's bottom stop", async ({
	page,
}) => {
	await page.goto("/profile/100001");
	await page.getByRole("link", { name: /Profile photo 1 of/ }).click();
	const label = page.locator(".pswp__created-at-label");
	await expect(label).toBeVisible();
	await expect(label).toHaveText(/\d{2} \w+ \d{4}/);
	const background = await page
		.locator(".pswp__reply-composer")
		.evaluate((composer) => getComputedStyle(composer).backgroundColor);
	const gradient = await label.evaluate(
		(date) => getComputedStyle(date).backgroundImage,
	);
	expect(background).not.toBe("rgba(0, 0, 0, 0)");
	expect(gradient).toMatch(/^linear-gradient\(to top/);
	expect(gradient).toContain(`${background} 0%`);
});

test("a profile photo stays above its composer after inset and keyboard changes", async ({
	page,
}) => {
	await page.goto("/profile/100001");
	await page.getByRole("link", { name: /Profile photo 1 of/ }).click();
	await expect(
		page.getByRole("textbox", { name: "Reply to profile photo" }),
	).toBeEnabled();
	const photo = page.locator(
		'.pswp__item:not([aria-hidden="true"]) .pswp__img:not(.pswp__img--placeholder)',
	);
	await expect(photo).toBeVisible();
	for (const { viewport, insets } of [
		{
			viewport: { width: 420, height: 800 },
			insets: { top: 160, right: 40, bottom: 300, left: 32, ime: false },
		},
		{
			viewport: { width: 420, height: 500 },
			insets: { top: 30, right: 0, bottom: 24, left: 0, ime: true },
		},
	]) {
		await sendInsets(page, insets);
		await page.setViewportSize(viewport);
		await expect
			.poll(async () => {
				const image = await photo.boundingBox();
				const composer = await page
					.locator(".pswp__reply-composer")
					.boundingBox();
				return (
					!!image &&
					!!composer &&
					image.x >= -1 &&
					image.y >= -1 &&
					image.x + image.width <= viewport.width + 1 &&
					image.y + image.height <= composer.y + 1
				);
			})
			.toBe(true);
	}
});
