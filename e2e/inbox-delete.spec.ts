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
import {
	backToChats,
	dim,
	recordFrames,
	row,
	rows,
	sheet,
	WIDE,
} from "./support/chat-stack";
import { systemBack } from "./support/page-stack";
import { PHONE } from "./support/stack-layers";

async function openInboxFromHome(
	page: Page,
	{ platform }: { platform?: string } = {},
) {
	await page.setViewportSize(WIDE);
	await installTauriShim(page, { platform });
	await page.goto("/");
	await page
		.getByRole("link", { name: "Inbox", exact: true })
		.click({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page).toHaveURL(/\/chat$/);
	await rows(page).nth(3).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

async function deleteFromList(page: Page, { href }: { href: string }) {
	await row(page, { href }).click({ button: "right" });
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	await expect(row(page, { href })).toHaveCount(0);
}

const noConversation = (page: Page) =>
	page.getByText("Select a conversation to start chatting");

async function openHref(page: Page, { href }: { href: string }) {
	await row(page, { href }).click();
	await expect(page).toHaveURL(new RegExp(`${href}$`));
}

async function openRow(page: Page, { nth }: { nth: number }) {
	const href = (await rows(page).nth(nth).getAttribute("href"))!;
	await openHref(page, { href });
	return href;
}

async function openRows(page: Page, { count }: { count: number }) {
	const hrefs = await rows(page).evaluateAll(
		(links, count) =>
			links.slice(1, count + 1).map((link) => link.getAttribute("href")!),
		count,
	);
	for (const href of hrefs) await openHref(page, { href });
	return hrefs;
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

test.describe("Back into a conversation deleted this session", () => {
	test("skips it to the entry before it", async ({ page }) => {
		await openInboxFromHome(page);
		const atInbox = await historyEntries(page);
		const [deleted, open] = await openRows(page, { count: 2 });
		await deleteFromList(page, { href: deleted! });
		const messagesShown = await watchRendered(page, {
			selector: MESSAGE_ROW,
		});

		await page.goBack();

		await expect
			.poll(() => historyEntries(page), {
				message: "Back lands on the inbox entry",
			})
			.toEqual({
				index: atInbox.index,
				paths: [...atInbox.paths, deleted, open],
			});
		await afterTwoFrames(page);
		expect(await pathname(page)).toBe("/chat");
		await expect(noConversation(page)).toBeVisible();
		expect(
			await messagesShown(),
			"the deleted conversation never opened",
		).toBe(false);
	});

	test("skips every deleted conversation in a row", async ({ page }) => {
		await openInboxFromHome(page);
		const atInbox = await historyEntries(page);
		const [first, second, open] = await openRows(page, { count: 3 });
		await deleteFromList(page, { href: first! });
		await deleteFromList(page, { href: second! });
		const messagesShown = await watchRendered(page, {
			selector: MESSAGE_ROW,
		});

		await page.goBack();

		await expect
			.poll(() => historyEntries(page), {
				message: "Back lands on the inbox entry",
			})
			.toEqual({
				index: atInbox.index,
				paths: [...atInbox.paths, first, second, open],
			});
		await afterTwoFrames(page);
		expect(await pathname(page)).toBe("/chat");
		expect(
			await messagesShown(),
			"neither deleted conversation opened",
		).toBe(false);
	});

	test("skips it when a jump back lands on it", async ({ page }) => {
		await openInboxFromHome(page);
		const atInbox = await historyEntries(page);
		const [deleted, kept, open] = await openRows(page, { count: 3 });
		await deleteFromList(page, { href: deleted! });

		await page.evaluate(() => history.go(-2));

		await expect
			.poll(() => historyEntries(page), {
				message: "the jump lands on the inbox entry",
			})
			.toEqual({
				index: atInbox.index,
				paths: [...atInbox.paths, deleted, kept, open],
			});
		await afterTwoFrames(page);
		expect(await pathname(page)).toBe("/chat");
	});

	test("still opens a conversation that was not deleted on the way", async ({
		page,
	}) => {
		await openInboxFromHome(page);
		const atInbox = await historyEntries(page);
		const [deleted, kept, open] = await openRows(page, { count: 3 });
		await deleteFromList(page, { href: deleted! });

		await page.goBack();

		await expect
			.poll(() => historyEntries(page), {
				message: "Back lands on the conversation just before",
			})
			.toEqual({
				index: atInbox.index + 2,
				paths: [...atInbox.paths, deleted, kept, open],
			});
		await afterTwoFrames(page);
		expect(await pathname(page)).toBe(kept);
		await expect(page.locator(MESSAGE_ROW).first()).toBeVisible();
	});

	test("Back to chats skips it and still answers the next tap", async ({
		page,
	}) => {
		await openInboxFromHome(page);
		const atInbox = await historyEntries(page);
		const [kept, deleted, open] = await openRows(page, { count: 3 });
		await deleteFromList(page, { href: deleted! });
		const paths = [...atInbox.paths, kept, deleted, open];

		await backToChats(page).click();
		await expect
			.poll(() => historyEntries(page), {
				message: "Back to chats lands on the conversation before",
			})
			.toEqual({ index: atInbox.index + 1, paths });
		await backToChats(page).click();

		await expect
			.poll(() => historyEntries(page), {
				message: "the next tap reaches the inbox",
			})
			.toEqual({ index: atInbox.index, paths });
		expect(await pathname(page)).toBe("/chat");
	});

	test("the Android back gesture skips it and slides the open conversation out", async ({
		page,
	}) => {
		await openInboxFromHome(page, { platform: "android" });
		const atInbox = await historyEntries(page);
		const [deleted, open] = await openRows(page, { count: 2 });
		await deleteFromList(page, { href: deleted! });
		await page.setViewportSize(PHONE);
		await expect(sheet(page)).toBeVisible();
		await expect(dim(page)).toHaveCount(0);
		const messagesShown = await watchRendered(page, {
			selector: MESSAGE_ROW,
		});
		const recording = recordFrames(page);

		await systemBack(page);

		const leaving = (await recording)
			.filter(({ path, sheet }) => path === "/chat" && sheet !== null)
			.map(({ sheet }) => sheet ?? 0);
		expect(leaving.length, "the conversation slides out").toBeGreaterThan(
			3,
		);
		expect(leaving[0]).toBeLessThan(PHONE.width * 0.5);
		expect(leaving.at(-1)).toBeGreaterThan(PHONE.width * 0.9);
		for (let i = 1; i < leaving.length; i++)
			expect(leaving[i], "it only ever moves out").toBeGreaterThanOrEqual(
				leaving[i - 1]!,
			);
		await expect(sheet(page)).toHaveCount(0);
		expect(await historyEntries(page)).toEqual({
			index: atInbox.index,
			paths: [...atInbox.paths, deleted, open],
		});
		expect(
			await messagesShown(),
			"the deleted conversation never opened",
		).toBe(false);
	});

	test("without the Navigation API Back steps past each one", async ({
		page,
	}) => {
		await page.addInitScript(() =>
			Object.defineProperty(window, "navigation", { value: undefined }),
		);
		await openInboxFromHome(page);
		const [first, second] = await openRows(page, { count: 3 });
		await deleteFromList(page, { href: first! });
		await deleteFromList(page, { href: second! });
		const messagesShown = await watchRendered(page, {
			selector: MESSAGE_ROW,
		});

		await page.goBack();

		await expect
			.poll(() => pathname(page), { message: "Back lands on the inbox" })
			.toBe("/chat");
		await afterTwoFrames(page);
		expect(await pathname(page)).toBe("/chat");
		expect(
			await messagesShown(),
			"neither deleted conversation opened",
		).toBe(false);
		await page.goBack();
		await expect
			.poll(() => pathname(page), {
				message:
					"that was the inbox entry, with the home screen before it",
			})
			.toBe("/");
	});
});
