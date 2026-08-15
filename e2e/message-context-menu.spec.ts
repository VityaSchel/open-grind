import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const CONVERSATION = "/chat/100001:123456000";

test("right-clicking a message opens its context menu", async ({ page }) => {
	await installTauriShim(page);
	await page.goto(CONVERSATION);

	const bubble = page.getByText("Hey! Lorem ipsum dolor sit amet.").first();
	await bubble.waitFor();

	await bubble.click({ button: "right" });

	await expect(
		page.getByRole("button", { name: "Copy message" }),
	).toBeVisible();
});
