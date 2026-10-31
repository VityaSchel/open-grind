import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";

test("hidden album controls do not send a reaction when tapped", async ({
	page,
}) => {
	await serveImages(page, CHAT_MEDIA_HOST);
	await installTauriShim(page);
	await page.goto("/chat/100006:123456000");
	const reactions = page.getByRole("img", {
		name: "Fire reaction",
		exact: true,
	});
	await page
		.getByRole("button", { name: "Open album", exact: true })
		.last()
		.click();
	const react = page.getByRole("button", {
		name: "React to album item with fire",
	});
	await expect(react).toBeEnabled();
	const bounds = await react.boundingBox();
	if (!bounds) throw new Error("The reaction button is not laid out");
	const count = await reactions.count();
	await page
		.locator(
			'.pswp__item:not([aria-hidden="true"]) .pswp__img:not(.pswp__img--placeholder)',
		)
		.tap();
	await expect(page.locator(".pswp")).not.toHaveClass(/pswp--ui-visible/);
	await page.touchscreen.tap(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	await page.getByRole("button", { name: "Close", exact: true }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(reactions).toHaveCount(count);
});

test("an album composer sends reactions and replies to the selected item", async ({
	page,
}) => {
	await serveImages(page, CHAT_MEDIA_HOST);
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
	await page.goto("/chat/100006:123456000");
	await page.getByRole("textbox").fill("Keep this draft");
	await page
		.getByRole("button", { name: "Open album", exact: true })
		.last()
		.click();
	const react = page.getByRole("button", {
		name: "React to album item with fire",
	});
	await expect(react).toBeEnabled();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
	await react.click();
	await expect(react).toBeDisabled();
	await expect(react).toHaveClass(/bg-primary/);
	await page.keyboard.press("ArrowLeft");
	await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
	await expect(react).toBeEnabled();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
	await expect(react).toBeDisabled();
	await expect(page.getByRole("dialog")).toBeVisible();
	await page.getByRole("button", { name: "Close", exact: true }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(page.getByRole("textbox")).toHaveValue("Keep this draft");
	const reaction = page
		.getByRole("article")
		.filter({
			has: page.getByRole("button", {
				name: "Open reacted album content",
			}),
		})
		.last();
	await expect(
		reaction.getByRole("img", { name: "Fire reaction" }),
	).toBeVisible();
	await expect(reaction.locator('[data-slot="message-bubble"]')).toHaveCount(
		0,
	);
	await expect(reaction.locator('[data-slot="message-quote"]')).toBeVisible();
	await expect(reaction.locator('[data-slot="badge"]')).toHaveCount(0);
	await reaction
		.getByRole("button", { name: "Open reacted album content" })
		.click();
	await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
	await expect(react).toBeEnabled();
	const replyBox = page.getByRole("textbox", { name: "Reply to album item" });
	await expect(replyBox).toBeEnabled();
	await expect(replyBox).toHaveAttribute("placeholder", "Write a reply...");
	expect(
		await replyBox.evaluate((input) => {
			let element: Element | null = input;
			while (element) {
				if (getComputedStyle(element).touchAction === "none")
					return false;
				element = element.parentElement;
			}
			return true;
		}),
	).toBe(true);
	const inputBounds = await replyBox.boundingBox();
	const reactionBounds = await react.boundingBox();
	expect(reactionBounds!.width).toBe(36);
	expect(reactionBounds!.height).toBe(36);
	const radii = await react.evaluate((button) => {
		const style = getComputedStyle(button);
		return [
			style.borderTopLeftRadius,
			style.borderTopRightRadius,
			style.borderBottomRightRadius,
			style.borderBottomLeftRadius,
		];
	});
	expect(new Set(radii).size).toBe(1);
	expect(parseFloat(radii[0]!)).toBeGreaterThanOrEqual(
		reactionBounds!.width / 2,
	);
	const fireBounds = await react.locator("img").boundingBox();
	expect(reactionBounds!.y).toBeGreaterThanOrEqual(inputBounds!.y);
	expect(reactionBounds!.y + reactionBounds!.height).toBeLessThanOrEqual(
		inputBounds!.y + inputBounds!.height,
	);
	await replyBox.fill("Love this album photo\nA second line\nA third line");
	await expect(react).toHaveCount(0);
	const send = page.getByRole("button", { name: "Send reply", exact: true });
	await expect
		.poll(async () => {
			const icon = await send.locator("svg").boundingBox();
			return icon!.x + icon!.width / 2;
		})
		.toBeCloseTo(fireBounds!.x + fireBounds!.width / 2, 0);
	const photo = page.locator(
		'.pswp__item:not([aria-hidden="true"]) .pswp__img:not(.pswp__img--placeholder)',
	);
	await expect
		.poll(async () => {
			const image = await photo.boundingBox();
			const composer = await page
				.locator(".pswp__reply-composer")
				.boundingBox();
			return (
				!!image &&
				!!composer &&
				image.y + image.height <= composer.y + 1
			);
		})
		.toBe(true);
	await page.getByRole("button", { name: "Send reply", exact: true }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(page.getByRole("textbox")).toHaveValue("Keep this draft");
	const reply = page
		.getByRole("article")
		.filter({ hasText: "Love this album photo" });
	await expect(reply).toBeVisible();
	await expect(reply.locator('[data-slot="message-quote"]')).toBeVisible();
	await reply
		.getByRole("button", { name: "Open replied album content" })
		.click();
	await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
	await expect(react).toBeEnabled();
	await expect(replyBox).toHaveValue("");
});
