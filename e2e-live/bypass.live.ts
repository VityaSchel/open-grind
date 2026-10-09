import type { Page } from "@playwright/test";

import { invoke } from "./support/app";
import {
	liveConversationId,
	recordLiveConversation,
	uploadUniquePhotoToDrawer,
} from "./support/chat";
import { counterpart } from "./support/counterpart";
import { adb, liveDevice } from "./support/device";
import { expect, test } from "./support/fixtures";
import { uniqueLiveName } from "./support/names";
import { navigateInApp } from "./support/navigation";

const MARKER = "honduras-hold.data";
const STRANDED_METERS = 1_000_000;

function appDataEntries(): string[] {
	return adb(["shell", "run-as", liveDevice.appPackage, "ls", "."])
		.split(/\s+/)
		.filter(Boolean);
}

function holdMarkerLeftBehind(): boolean {
	return appDataEntries().includes(MARKER);
}

async function distanceAtHome(): Promise<number> {
	const entries = appDataEntries();
	expect(entries, "the listing is the app data root").toContain(
		"preferences.data",
	);
	expect(entries, "no hold is left from an earlier run").not.toContain(
		MARKER,
	);
	const meters = await counterpart.peerDistance();
	expect(meters, "the profile starts at its own location").toBeLessThan(
		STRANDED_METERS,
	);
	return meters;
}

async function expectBackHome(homeMeters: number) {
	await expect.poll(holdMarkerLeftBehind, { timeout: 60_000 }).toBe(false);
	expect(
		await counterpart.peerDistance(),
		"the profile is back at its own location",
	).toBeCloseTo(homeMeters, -4);
}

function bypassPrompt(page: Page) {
	return page.getByRole("heading", { name: "Paid feature" });
}

async function openChatWithoutRegionGrant(page: Page) {
	await navigateInApp({ page, path: `/chat/${liveConversationId}` });
	if (await bypassPrompt(page).isVisible()) {
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(bypassPrompt(page)).toBeHidden();
	}
	await invoke({ page, command: "refresh_session" });
}

async function bypassPaywall(page: Page) {
	await page.getByRole("button", { name: "Bypass" }).click();
	await expect(
		bypassPrompt(page),
		"the action retried under the bypass has settled",
	).toBeHidden({ timeout: 120_000 });
	await expect(
		page.getByText("Failed to bypass this paid feature"),
	).toBeHidden();
}

async function sendSelectedAsExpiring(page: Page) {
	await page.locator('[data-slot="media-tile"]').first().click();
	const expiring = page.getByRole("button", {
		name: "Set photo as expiring after 10 seconds",
	});
	if ((await expiring.getAttribute("aria-pressed")) !== "true") {
		await expiring.click();
	}
	await page.getByRole("button", { name: /^Send/ }).click();
}

test("unsending a message past the paywall works under the bypass", async ({
	app,
	ledger,
}) => {
	test.setTimeout(600_000);
	recordLiveConversation(ledger);
	const homeMeters = await distanceAtHome();

	await openChatWithoutRegionGrant(app);
	const text = uniqueLiveName("unsend");
	await app.getByRole("textbox").fill(text);
	await app.getByRole("button", { name: "Send message" }).click();
	expect(
		await counterpart.findMessage({ text }),
		"the counterpart has the message to unsend",
	).toMatchObject({ found: true });

	const bubble = app.getByRole("article").getByText(text);
	await bubble.click({ button: "right" });
	await app.getByRole("button", { name: "Unsend message" }).click();
	await expect(
		bypassPrompt(app),
		"unsending is paywalled for this account",
	).toBeVisible();
	await bypassPaywall(app);
	await expectBackHome(homeMeters);

	await expect(
		bubble,
		"the server accepted the unsend under the Honduras session",
	).toBeHidden();
	await expect(app.getByText("Message unsent").last()).toBeVisible();
});

test("sending an expiring photo past the daily cap works under the bypass", async ({
	app,
	ledger,
}) => {
	test.setTimeout(600_000);
	recordLiveConversation(ledger);
	const homeMeters = await distanceAtHome();
	const sentAfterMs = Date.now() - 60_000;

	await openChatWithoutRegionGrant(app);
	await uploadUniquePhotoToDrawer({
		page: app,
		ledger,
		label: "expiring bypass photo",
	});
	await sendSelectedAsExpiring(app);

	await expect(
		bypassPrompt(app),
		"the daily expiring photo allowance is spent",
	).toBeVisible({ timeout: 120_000 });
	await bypassPaywall(app);
	expect(
		await counterpart.findMessage({
			type: "ExpiringImage",
			sinceMs: sentAfterMs,
		}),
		"the expiring photo reached the counterpart",
	).toMatchObject({ found: true });
	await expectBackHome(homeMeters);
});
