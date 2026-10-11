import { expect, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";

const DEVICE_PIXEL_RATIO = 2.625;
const WINDOW = { width: 420, height: 800 };
const ME = 123456000;
const CONVERSATIONS_MODULE_URL =
	"/src/lib/chat/conversations-context.svelte.ts";
const SCROLLER = '[data-slot="conversations-scroller"]';
const PLACEHOLDER = '[data-slot="conversation-placeholder"]';
const ROW_LINK = 'a[href^="/chat/"]';
const LATER_CONVERSATIONS = 6;

test.describe.configure({ timeout: 300_000 });

test.use({
	viewport: null,
	deviceScaleFactor: ({ contextOptions }, use) =>
		use(contextOptions.deviceScaleFactor),
	launchOptions: ({ launchOptions }, use) =>
		use({
			...launchOptions,
			args: [
				...(launchOptions.args ?? []),
				`--force-device-scale-factor=${DEVICE_PIXEL_RATIO}`,
				`--window-size=${WINDOW.width},${WINDOW.height}`,
			],
		}),
});

test("a conversation still waiting to mount takes up exactly the height of its row", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/chat");
	await page
		.locator(`${SCROLLER} ${ROW_LINK}`)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

	const waiting = await page.evaluate(
		async ({ module, me, count, placeholderSelector }) => {
			const { getOrCreateConversationsState } = await import(module);
			const conversations = getOrCreateConversationsState(me);
			const placeholders = new Promise<
				{ position: number; height: number }[]
			>((resolve) => {
				const observer = new MutationObserver(() => {
					const found = [
						...document.querySelectorAll(placeholderSelector),
					];
					if (found.length === 0) return;
					observer.disconnect();
					resolve(
						found.map((placeholder) => ({
							position: [
								...placeholder.parentElement!.children,
							].indexOf(placeholder),
							height: placeholder.getBoundingClientRect().height,
						})),
					);
				});
				observer.observe(document.body, {
					childList: true,
					subtree: true,
				});
			});
			const template = conversations.entries.at(-1);
			for (let copy = 1; copy <= count; copy++) {
				const later = JSON.parse(JSON.stringify(template)) as {
					data: { conversationId: string };
				};
				later.data.conversationId = `${900000 + copy}:${me}`;
				conversations.entries.push(later);
			}
			return placeholders;
		},
		{
			module: CONVERSATIONS_MODULE_URL,
			me: ME,
			count: LATER_CONVERSATIONS,
			placeholderSelector: PLACEHOLDER,
		},
	);
	expect(waiting.length, "later conversations wait to mount").toBeGreaterThan(
		0,
	);

	await expect(page.locator(PLACEHOLDER)).toHaveCount(0);
	const mounted = await page.locator(SCROLLER).evaluate(
		(scroller, positions) =>
			positions.map(
				(position) =>
					scroller.firstElementChild!.children[
						position
					]!.getBoundingClientRect().height,
			),
		waiting.map(({ position }) => position),
	);

	const mismatch = mounted.map((height, index) =>
		Math.abs(height - waiting[index]!.height),
	);
	expect(
		Math.max(...mismatch),
		"each row mounts into exactly the space its placeholder held",
	).toBeLessThan(0.01);
});
