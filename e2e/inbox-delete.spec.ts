import { expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	historyEntries,
	installTauriShim,
	MESSAGE_ROW,
	pathname,
	watchRendered,
} from "./support/app";
import { row, rows, WIDE } from "./support/chat-stack";

async function openInboxFromHome(page: Page) {
	await page.setViewportSize(WIDE);
	await installTauriShim(page);
	await page.goto("/");
	await page
		.getByRole("link", { name: "Inbox", exact: true })
		.click({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page).toHaveURL(/\/chat$/);
	await rows(page).nth(2).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

async function deleteFromList(page: Page, { href }: { href: string }) {
	await row(page, { href }).click({ button: "right" });
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	await expect(row(page, { href })).toHaveCount(0);
}

const noConversation = (page: Page) =>
	page.getByText("Select a conversation to start chatting");

async function openRow(page: Page, { nth }: { nth: number }) {
	const href = (await rows(page).nth(nth).getAttribute("href"))!;
	await row(page, { href }).click();
	await expect(page).toHaveURL(new RegExp(`${href}$`));
	return href;
}

test("deleting the open conversation from the list walks back to the inbox", async ({
	page,
}) => {
	await openInboxFromHome(page);
	const atInbox = await historyEntries(page);

	await deleteFromList(page, { href: await openRow(page, { nth: 1 }) });

	await expect(page).toHaveURL(/\/chat$/);
	const atDeleted = await historyEntries(page);
	expect(
		atDeleted.index,
		`entries ${atDeleted.paths.join(" ")} @${atDeleted.index}`,
	).toBe(atInbox.index);

	await page.goBack();
	await expect
		.poll(() => pathname(page), {
			message: "Back from the inbox leaves it for the screen before",
		})
		.toBe("/");
});

test("Forward does not reopen a conversation deleted while open", async ({
	page,
}) => {
	await openInboxFromHome(page);
	const atInbox = await historyEntries(page);
	const href = await openRow(page, { nth: 1 });
	await deleteFromList(page, { href });
	await expect(page).toHaveURL(/\/chat$/);
	await expect(noConversation(page)).toBeVisible();
	const messagesShown = await watchRendered(page, { selector: MESSAGE_ROW });

	await page.goForward();

	await expect
		.poll(() => historyEntries(page), {
			message: "Forward stays on the inbox entry",
		})
		.toEqual({ index: atInbox.index, paths: [...atInbox.paths, href] });
	await afterTwoFrames(page);
	expect(await pathname(page)).toBe("/chat");
	await expect(noConversation(page)).toBeVisible();
	expect(await messagesShown(), "the deleted conversation never opened").toBe(
		false,
	);
});

test("Forward still opens a conversation that was not deleted", async ({
	page,
}) => {
	await openInboxFromHome(page);
	const deleted = (await rows(page).nth(2).getAttribute("href"))!;
	const kept = await openRow(page, { nth: 1 });
	await page.goBack();
	await expect(page).toHaveURL(/\/chat$/);
	await deleteFromList(page, { href: deleted });

	await page.goForward();

	await expect(page).toHaveURL(new RegExp(`${kept}$`));
	await expect(page.locator(MESSAGE_ROW).first()).toBeVisible();
});

test("deleting a conversation opened directly takes its place in history", async ({
	page,
}) => {
	await page.setViewportSize(WIDE);
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);

	const opened = row(page, { href: DEMO_CONVERSATION });
	await opened.click({ button: "right", timeout: FIRST_ROUTE_COMPILE_MS });
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();

	await expect(page).toHaveURL(/\/chat$/);
	await expect(opened).toHaveCount(0);
	expect(await historyEntries(page)).toEqual({ index: 0, paths: ["/chat"] });
});
