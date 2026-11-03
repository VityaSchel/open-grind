import { expect, type Page, test } from "@playwright/test";

import { HISTORY_METADATA_KEY } from "../src/lib/util/history-index";
import {
	afterTwoFrames,
	backLink,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	MESSAGE_ROW,
	meTab,
	pathname,
	watchRendered,
} from "./support/app";
import {
	backToChats,
	openConversation,
	openInbox,
	row,
	rows,
	sheet,
	WIDE,
} from "./support/chat-stack";
import {
	APP_SETTINGS,
	CREDITS,
	openAppSettings,
	openDeepLink,
	openSettings,
	pane,
	SETTINGS,
	stackSettled,
} from "./support/page-stack";
import { PHONE } from "./support/stack-layers";
import {
	commitSystemBack,
	progressSystemBack,
	startSystemBack,
} from "./support/system-back";

test.describe.configure({ timeout: 180_000 });

const PROFILE_LINK = 'a[href^="/profile/"]';

const historyAt = (page: Page) =>
	page.evaluate(
		(key) => ({
			index: (
				history.state as Record<
					string,
					{ historyIndex?: number }
				> | null
			)?.[key]?.historyIndex,
			length: history.length,
			pathname: location.pathname,
		}),
		HISTORY_METADATA_KEY,
	);

async function openCredits(page: Page) {
	await page.getByRole("link", { name: "Credits & Licenses" }).click();
	await expect(page).toHaveURL(new RegExp(`${CREDITS}$`));
	await stackSettled(page);
}

type StackFrame = { live: number; ghost: number | null };

function recordStackFrames(page: Page): Promise<StackFrame[]> {
	return page.evaluate(
		() =>
			new Promise<StackFrame[]>((resolve) => {
				const frames: StackFrame[] = [];
				const x = (slot: string) =>
					document
						.querySelector(`[data-slot="page-stack-${slot}"]`)
						?.getBoundingClientRect().x ?? null;
				const started = performance.now();
				const sample = () => {
					frames.push({ live: x("pane") ?? 0, ghost: x("ghost") });
					if (performance.now() - started < 1500)
						requestAnimationFrame(sample);
					else resolve(frames);
				};
				requestAnimationFrame(sample);
			}),
	);
}

test("SvelteKit numbers each history entry where the history log reads it", async ({
	page,
}) => {
	const entry = () =>
		page.evaluate(
			(key) => ({
				kit: (
					history.state as Record<
						string,
						{ historyIndex?: number }
					> | null
				)?.[key]?.historyIndex,
				navigation: navigation.currentEntry!.index,
			}),
			HISTORY_METADATA_KEY,
		);
	await installTauriShim(page, { platform: "ios" });
	await page.goto("/interest/taps");
	await page
		.locator(PROFILE_LINK)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	const steps = [await entry()];

	await page.getByRole("link", { name: "Views" }).click();
	await expect(page).toHaveURL(/\/interest\/views$/);
	steps.push(await entry());
	await meTab(page).click();
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
	steps.push(await entry());
	await openAppSettings(page);
	steps.push(await entry());
	await page.goBack();
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
	steps.push(await entry());
	await page.reload();
	await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	steps.push(await entry());

	const [first] = steps;
	expect(typeof first!.kit, "the entry carries SvelteKit's index").toBe(
		"number",
	);
	expect(
		steps.map(({ kit }) => kit! - first!.kit!),
		"a replace keeps the index, a push adds one, Back takes one off, a reload keeps it",
	).toEqual([0, 0, 1, 2, 1, 1]);
	expect(
		steps.map(({ navigation }) => navigation - first!.navigation),
	).toEqual([0, 0, 1, 2, 1, 1]);
});

test.describe("without the Navigation API", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() =>
			Object.defineProperty(window, "navigation", { value: undefined }),
		);
	});

	test("the Me tab walks back to the Me screen instead of pushing it again", async ({
		page,
	}) => {
		await openSettings(page, { platform: "ios" });
		expect(await page.evaluate(() => typeof window.navigation)).toBe(
			"undefined",
		);
		const atSettings = await historyAt(page);
		await openAppSettings(page);
		await openCredits(page);
		const atCredits = await historyAt(page);

		await meTab(page).click();
		await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
		await stackSettled(page);

		expect(
			await historyAt(page),
			"it traversed onto the Me entry, keeping both subpages ahead",
		).toEqual({ ...atSettings, length: atCredits.length });
		await page.goForward();
		await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
	});

	test("Back takes a deep-linked subpage's place with its parent", async ({
		page,
	}) => {
		await openDeepLink(page, CREDITS, { platform: "ios" });
		const atCredits = await historyAt(page);

		await backLink(page).click();
		await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));

		expect(await historyAt(page)).toEqual({
			...atCredits,
			pathname: APP_SETTINGS,
		});
	});

	test("Back slides a page opened before a reload off onto the page it came from", async ({
		page,
	}) => {
		await openSettings(page, { platform: "ios" });
		await openAppSettings(page);
		await openCredits(page);
		await page.reload();
		await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await stackSettled(page);
		const { width } = page.viewportSize()!;
		const atCredits = await historyAt(page);

		const recording = recordStackFrames(page);
		await backLink(page).click();
		await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
		const sliding = (await recording).filter(
			(frame): frame is { live: number; ghost: number } =>
				frame.ghost !== null,
		);

		expect(
			sliding.length,
			"Credits slides off over App Settings",
		).toBeGreaterThan(3);
		expect(
			sliding[0]!.live,
			"App Settings waits behind, shifted left",
		).toBeLessThan(0);
		expect(sliding[0]!.ghost).toBeLessThan(width * 0.5);
		expect(sliding.at(-1)!.ghost).toBeGreaterThan(width * 0.9);
		for (let i = 1; i < sliding.length; i++)
			expect(
				sliding[i]!.ghost,
				"Credits only ever moves right",
			).toBeGreaterThanOrEqual(sliding[i - 1]!.ghost);
		await stackSettled(page);
		expect((await historyAt(page)).index).toBe(atCredits.index! - 1);
	});

	test.describe("on a phone", () => {
		test.use({ viewport: PHONE });

		test("Back to chats walks back to the inbox and keeps the conversation ahead", async ({
			page,
		}) => {
			await openInbox(page, { platform: "ios" });
			const atInbox = await historyAt(page);
			const href = await openConversation(page);

			await backToChats(page).click();
			await expect(page).toHaveURL(/\/chat$/);
			await expect(sheet(page)).toHaveCount(0);

			expect(await historyAt(page)).toEqual({
				...atInbox,
				length: atInbox.length + 1,
			});
			await page.goForward();
			await expect(page).toHaveURL(new RegExp(`${href}$`));
		});

		test("the back gesture drags a conversation off the inbox it was opened from", async ({
			page,
		}) => {
			await openInbox(page, { platform: "android" });
			await openConversation(page);

			expect(
				await startSystemBack(page),
				"the stack knows the inbox is the entry behind",
			).toBe(true);
			await progressSystemBack(page, 0.5);
			expect(await commitSystemBack(page)).toBe(false);

			await expect(page).toHaveURL(/\/chat$/);
			await expect(sheet(page)).toHaveCount(0);
		});
	});

	test("Back into conversations deleted this session skips them in one traversal", async ({
		page,
	}) => {
		await page.setViewportSize(WIDE);
		await installTauriShim(page, { platform: "macos" });
		await page.goto("/");
		await page
			.getByRole("link", { name: "Inbox", exact: true })
			.click({ timeout: FIRST_ROUTE_COMPILE_MS });
		await expect(page).toHaveURL(/\/chat$/);
		await rows(page).nth(3).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		const atInbox = await historyAt(page);
		const hrefs = await rows(page).evaluateAll((links) =>
			links.slice(1, 4).map((link) => link.getAttribute("href")!),
		);
		for (const href of hrefs) {
			await row(page, { href }).click();
			await expect(page).toHaveURL(new RegExp(`${href}$`));
		}
		for (const href of hrefs.slice(0, 2)) {
			await row(page, { href }).click({ button: "right" });
			await page.getByRole("menuitem", { name: "Delete" }).click();
			await page
				.getByRole("button", { name: "Delete", exact: true })
				.click();
			await expect(row(page, { href })).toHaveCount(0);
		}
		const messagesShown = await watchRendered(page, {
			selector: MESSAGE_ROW,
		});

		await page.goBack();

		await expect
			.poll(() => historyAt(page), {
				message: "Back lands on the inbox entry",
			})
			.toEqual({ ...atInbox, length: atInbox.length + 3 });
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
