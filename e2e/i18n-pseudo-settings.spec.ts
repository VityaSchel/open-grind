import { expect, type Locator, type Page, test } from "@playwright/test";

import { PSEUDO_MESSAGE } from "../src/lib/i18n/fixtures/pseudo-message";
import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import { APP_SETTINGS, SETTINGS } from "./support/page-stack";
import { readPseudoText } from "./support/pseudo";

const ACCOUNT_SETTINGS = `${SETTINGS}/account`;
const BLOCKED_USERS = `${ACCOUNT_SETTINGS}/blocked`;
const ME_LANDMARKS = 2;
const SUBPAGE_LANDMARKS = 3;
const BLOCKED_ROWS = 12;
const UNAVAILABLE_PROFILE = "100802";
const PROFILE_NAME = 'a[href^="/profile/"] [translate="no"]';
const SWITCH = '[role="switch"]';

test.describe.configure({ timeout: 180_000 });

type PseudoScan = Awaited<ReturnType<typeof readPseudoText>>;

async function openUnderPseudoLocale(
	page: Page,
	{
		path,
		shows,
		landmarks,
	}: { path: string; shows: string; landmarks: number },
): Promise<Locator> {
	await page.goto(`${path}?locale=en-XA`);
	const content = page.getByRole("main");
	await content
		.locator(shows)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	const roots = content.or(page.getByRole("navigation"));
	await expect(roots).toHaveCount(landmarks);
	return roots;
}

function expectOnlyPseudoText(scans: readonly PseudoScan[]): void {
	for (const { messages, leaks } of scans) {
		expect(messages).toBeGreaterThan(0);
		expect(leaks).toEqual([]);
	}
}

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test("the Me page, its sign-out dialog and its Telegram warning render only pseudo-translated text", async ({
	page,
}) => {
	const roots = await openUnderPseudoLocale(page, {
		path: SETTINGS,
		shows: PROFILE_NAME,
		landmarks: ME_LANDMARKS,
	});
	const scans = [await readPseudoText(roots)];
	const buttons = page.getByRole("main").getByRole("button");
	await expect(buttons).toHaveCount(2);
	const dialogs = [
		{ opener: buttons.first(), role: "alertdialog" },
		{ opener: buttons.last(), role: "dialog" },
	] as const;
	for (const { opener, role } of dialogs) {
		await opener.click();
		const dialog = page.getByRole(role);
		await dialog.waitFor();
		scans.push(await readPseudoText(dialog));
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	}
	expectOnlyPseudoText(scans);
});

test("the blocked users list, its unavailable row and its switch names render only pseudo-translated text", async ({
	page,
}) => {
	const roots = await openUnderPseudoLocale(page, {
		path: BLOCKED_USERS,
		shows: SWITCH,
		landmarks: SUBPAGE_LANDMARKS,
	});
	const content = page.getByRole("main");
	await expect(content.getByRole("switch")).toHaveCount(BLOCKED_ROWS);
	await expect(
		content.locator(`a[href="/profile/${UNAVAILABLE_PROFILE}"]`),
	).toContainText(UNAVAILABLE_PROFILE);
	await expect(
		content.getByRole("switch", { name: UNAVAILABLE_PROFILE }),
	).toBeVisible();
	await expect(page).toHaveTitle(PSEUDO_MESSAGE);
	const scan = await readPseudoText(roots);
	expect(scan.labels).toBeGreaterThan(0);
	expectOnlyPseudoText([scan]);
});

test.describe("settings pages under en-XA", () => {
	const subpages = [
		{
			path: ACCOUNT_SETTINGS,
			shows: `a[href="${ACCOUNT_SETTINGS}/privacy"]`,
		},
		{ path: `${ACCOUNT_SETTINGS}/privacy`, shows: SWITCH },
		{
			path: `${ACCOUNT_SETTINGS}/hidden`,
			shows: `[data-slot="empty-title"], ${SWITCH}`,
			titled: true,
		},
		{ path: APP_SETTINGS, shows: `a[href="${APP_SETTINGS}/credits"]` },
		{
			path: `${APP_SETTINGS}/language`,
			shows: '[data-slot="language-option"]',
		},
		{ path: `${APP_SETTINGS}/notifications`, shows: "p" },
		{ path: `${APP_SETTINGS}/credits`, shows: 'a[href$="/issues/new"]' },
		{ path: `${SETTINGS}/profile`, shows: '[data-slot="profile-form"]' },
	];

	for (const { path, shows, titled = false } of subpages) {
		test(`${path} renders its main and navigation landmarks only pseudo-translated`, async ({
			page,
		}) => {
			const roots = await openUnderPseudoLocale(page, {
				path,
				shows,
				landmarks: SUBPAGE_LANDMARKS,
			});
			if (titled) await expect(page).toHaveTitle(PSEUDO_MESSAGE);
			expectOnlyPseudoText([await readPseudoText(roots)]);
		});
	}
});
