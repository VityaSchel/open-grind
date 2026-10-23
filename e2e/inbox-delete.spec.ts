import { expect, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	historyEntries,
	installTauriShim,
	pathname,
} from "./support/app";
import { row, rows, WIDE } from "./support/chat-stack";

test("deleting the open conversation from the list walks back to the inbox", async ({
	page,
}) => {
	await page.setViewportSize(WIDE);
	await installTauriShim(page);
	await page.goto("/");
	await page
		.getByRole("link", { name: "Inbox", exact: true })
		.click({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page).toHaveURL(/\/chat$/);
	await rows(page).nth(1).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	const atInbox = await historyEntries(page);

	const href = (await rows(page).nth(1).getAttribute("href"))!;
	await row(page, { href }).click();
	await expect(page).toHaveURL(new RegExp(`${href}$`));

	await row(page, { href }).click({ button: "right" });
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();

	await expect(page).toHaveURL(/\/chat$/);
	await expect(row(page, { href })).toHaveCount(0);
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
