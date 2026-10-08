import { expect, type Page, test } from "@playwright/test";

import { captureOpenedUrls, installTauriShim } from "./support/app";
import { routeDemoThroughFaultHook } from "./support/demo-faults";
import { DRAWER } from "./support/drawer";
import { expectNoToast } from "./support/toast";

const BLOCKABLE_PROFILE = "/profile/100001";
const NON_BLOCKABLE_PROFILE = "/profile/100010";
const NON_BLOCKABLE_BLOCK_PATH = "/v3/me/blocks/100010";
const WHY_BLOCKING_FAILS =
	"https://opengrind.org/guides/blocking-and-hiding-profiles#why-cant-i-block-some-profiles";
const BLOCKED = "You have blocked this profile.";
const DID_NOT_STICK = "Blocking this profile failed. Try hiding instead.";
const FAILED = "Failed to block user";

async function answerBlocksWith({
	page,
	status,
	delayMs = 0,
}: {
	page: Page;
	status: number;
	delayMs?: number;
}) {
	await page.addInitScript(
		({ path: blockPath, answer, delay }) => {
			Object.assign(window, {
				__demoFault: async ({
					path,
					method,
				}: {
					path: string;
					method: string;
				}) => {
					if (method !== "POST" || path !== blockPath)
						return undefined;
					await new Promise((resolve) => setTimeout(resolve, delay));
					return { status: answer, body: { updateTime: 0 } };
				},
			});
		},
		{ path: NON_BLOCKABLE_BLOCK_PATH, answer: status, delay: delayMs },
	);
	await routeDemoThroughFaultHook(page);
}

async function openProfileMenu({
	page,
	profile,
}: {
	page: Page;
	profile: string;
}) {
	await installTauriShim(page);
	await page.goto(profile);
	await page.getByLabel("Profile menu").click();
	await page.getByRole("menuitem", { name: "Hide profile" }).waitFor();
}

async function reportAsSpam({
	page,
	profile,
}: {
	page: Page;
	profile: string;
}) {
	await openProfileMenu({ page, profile });
	await page.getByRole("menuitem", { name: "Report profile" }).click();

	const drawer = page.locator(DRAWER);
	await drawer.waitFor({ timeout: 10_000 });
	await page.waitForTimeout(700);

	await drawer.getByRole("radio", { name: "Spam" }).click();
	await drawer.getByRole("button", { name: "Submit report" }).click();
	await expect(
		drawer.getByText("Grindr will review this profile."),
	).toBeVisible();
	return drawer;
}

for (const profile of [BLOCKABLE_PROFILE, NON_BLOCKABLE_PROFILE]) {
	test(`${profile} blocks from the profile menu`, async ({ page }) => {
		test.setTimeout(240_000);
		await openProfileMenu({ page, profile });

		const block = page.getByRole("menuitem", { name: "Block profile" });
		await expect(block).toBeEnabled();
		await block.click();

		await expect(page.getByText(BLOCKED)).toBeVisible();
	});
}

test("reporting a non-blockable profile offers Block and blocks", async ({
	page,
}) => {
	test.setTimeout(240_000);
	const drawer = await reportAsSpam({ page, profile: NON_BLOCKABLE_PROFILE });

	await expect(
		drawer.getByText("You can block this profile so you stop seeing it."),
	).toBeVisible();
	const block = drawer.getByRole("button", { name: "Block profile" });
	await expect(block).toBeEnabled();
	await block.click();

	await expect(drawer).toBeHidden();
	await expect(page.getByText(BLOCKED)).toBeVisible();
});

test("a block from the report sheet shows at once and is taken back when it does not stick", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await answerBlocksWith({ page, status: 200, delayMs: 1_500 });
	const drawer = await reportAsSpam({ page, profile: NON_BLOCKABLE_PROFILE });

	await drawer.getByRole("button", { name: "Block profile" }).click();

	await expect(drawer).toBeHidden();
	await expect(page.getByText(BLOCKED)).toBeVisible();
	await expect(page.getByText(DID_NOT_STICK)).toBeVisible();
	await expect(page.getByText(BLOCKED)).toBeHidden();
});

test("unblocking right after blocking reports nothing", async ({ page }) => {
	test.setTimeout(240_000);
	await answerBlocksWith({ page, status: 200, delayMs: 1_500 });
	await openProfileMenu({ page, profile: NON_BLOCKABLE_PROFILE });

	await page.getByRole("menuitem", { name: "Block profile" }).click();
	await page.getByRole("button", { name: "Unblock" }).click();

	await expect(page.getByText(BLOCKED)).toBeHidden();
	await expect(page.getByLabel("Profile menu")).toBeEnabled({
		timeout: 10_000,
	});
	await page.waitForTimeout(1_000);
	await expectNoToast(page, DID_NOT_STICK);
	await expectNoToast(page, FAILED);
});

test("a block Grindr accepts but does not list is taken back and suggests hiding", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await answerBlocksWith({ page, status: 200 });
	await openProfileMenu({ page, profile: NON_BLOCKABLE_PROFILE });
	const opened = await captureOpenedUrls(page);

	await page.getByRole("menuitem", { name: "Block profile" }).click();

	await expect(page.getByText(DID_NOT_STICK)).toBeVisible();
	await expect(page.getByText(BLOCKED)).toBeHidden();
	await expectNoToast(page, FAILED);
	await page.getByRole("button", { name: "Learn more" }).click();
	await expect.poll(opened).toEqual([WHY_BLOCKING_FAILS]);
});

test("a block Grindr refuses reports the failure without guessing why", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await answerBlocksWith({ page, status: 403 });
	await openProfileMenu({ page, profile: NON_BLOCKABLE_PROFILE });

	await page.getByRole("menuitem", { name: "Block profile" }).click();

	await expect(page.getByText(FAILED)).toBeVisible();
	await expectNoToast(page, DID_NOT_STICK);
	await expect(page.getByText(BLOCKED)).toBeHidden();
});
