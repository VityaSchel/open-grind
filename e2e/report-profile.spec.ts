import { expect, test } from "@playwright/test";

import { INCOMING_ROW, installTauriShim, MESSAGE_ROW } from "./support/app";
import { DRAWER } from "./support/drawer";

const DEMO_PROFILE = "/profile/100001";
const DEMO_CHAT = "/chat/100001:123456000";

async function openReportSheet(page: import("@playwright/test").Page) {
	await installTauriShim(page);
	await page.goto(DEMO_PROFILE);
	await page.getByLabel("Profile menu").click();
	await page.getByRole("menuitem", { name: "Report profile" }).click();
	const drawer = page.locator(DRAWER);
	await drawer.waitFor({ timeout: 10_000 });
	await page.waitForTimeout(700);
	return drawer;
}

test("reporting a profile submits it and offers to block", async ({ page }) => {
	test.setTimeout(240_000);
	const drawer = await openReportSheet(page);

	await expect(
		drawer.getByRole("heading", { name: "Report profile" }),
	).toBeVisible();

	const submit = drawer.getByRole("button", { name: "Submit report" });
	await expect(
		submit,
		"submit stays disabled until a reason is chosen",
	).toBeDisabled();

	await expect(
		drawer.getByRole("textbox", { name: "Details" }),
		"no fields before a reason is chosen",
	).toHaveCount(0);
	await expect(
		drawer.getByRole("button", { name: "Profile Photo" }),
	).toHaveCount(0);

	await drawer.getByRole("radio", { name: "Impersonation" }).click();
	await drawer.getByRole("button", { name: "Profile Photo" }).click();
	await drawer
		.getByRole("textbox", { name: "Details" })
		.fill("not who they say they are");
	await submit.click();

	await expect(
		drawer.getByText("Grindr will review this profile."),
	).toBeVisible();

	await drawer.getByRole("button", { name: "Block profile" }).click();
	await expect(page.locator(DRAWER)).toBeHidden();
	await expect(
		page.getByText("You have blocked this profile."),
	).toBeVisible();
});

test("a spam report asks for nothing else", async ({ page }) => {
	test.setTimeout(240_000);
	const drawer = await openReportSheet(page);

	await drawer.getByRole("radio", { name: "Spam" }).click();

	await expect(
		drawer.getByRole("textbox", { name: "Details" }),
		"spam needs no details",
	).toHaveCount(0);
	await expect(
		drawer.getByRole("button", { name: "Profile Photo" }),
		"spam needs no location",
	).toHaveCount(0);

	await drawer.getByRole("button", { name: "Submit report" }).click();
	await expect(
		drawer.getByText("Grindr will review this profile."),
	).toBeVisible();

	await drawer.getByRole("button", { name: "Done" }).click();
	await expect(page.locator(DRAWER)).toBeHidden();
	await expect(page.getByText("You have blocked this profile.")).toHaveCount(
		0,
	);
});

test("reporting a chat message titles the sheet for the message and prefills the chat location", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await installTauriShim(page);
	await page.goto(DEMO_CHAT);
	await page.locator(MESSAGE_ROW).first().waitFor();

	await page.locator(INCOMING_ROW).first().click({ button: "right" });
	await page.getByRole("button", { name: "Report", exact: true }).click();

	const drawer = page.locator(DRAWER);
	await drawer.waitFor({ timeout: 10_000 });
	await page.waitForTimeout(700);

	await expect(
		drawer.getByRole("heading", { name: "Report message" }),
	).toBeVisible();
	await expect(drawer).toHaveAccessibleDescription(
		"Send a report about this person's messages to Grindr.",
	);

	await drawer.getByRole("radio", { name: "Harassment or Bullying" }).click();
	await drawer
		.getByRole("textbox", { name: "Details" })
		.fill("abusive message");
	expect(
		await drawer.getByRole("button", { name: "Profile Photo" }).count(),
		"a chat report already knows where it happened",
	).toBe(0);
	await drawer.getByRole("button", { name: "Submit report" }).click();

	await expect(
		drawer.getByText("Grindr will review your report."),
	).toBeVisible();
	await expect(
		drawer.getByRole("button", { name: "Block profile" }),
		"blocking still targets the sender's profile",
	).toBeVisible();
});

test("the report opens as a dialog on a desktop-width viewport", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await installTauriShim(page);
	await page.goto(DEMO_PROFILE);
	await page.getByLabel("Profile menu").click();
	await page.getByRole("menuitem", { name: "Report profile" }).click();

	const dialog = page.locator('[data-slot="dialog-content"]');
	await dialog.waitFor({ timeout: 10_000 });
	await expect(
		page.locator(DRAWER),
		"a desktop viewport gets the dialog, not the bottom sheet",
	).toHaveCount(0);
	await expect(
		dialog.getByRole("heading", { name: "Report profile" }),
	).toBeVisible();

	await dialog.getByRole("radio", { name: "Spam" }).click();
	await dialog.getByRole("button", { name: "Submit report" }).click();

	await expect(
		dialog.getByText("Grindr will review this profile."),
	).toBeVisible();
});
