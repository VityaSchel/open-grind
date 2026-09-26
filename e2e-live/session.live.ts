import { liveAccounts } from "./support/accounts";
import { signedInProfileId } from "./support/app";
import { launchApp, stopApp } from "./support/device";
import { expect, test } from "./support/fixtures";
import { attachSignedInApp } from "./support/session";

test("the burner session resumes after the app restarts", async () => {
	stopApp();
	await launchApp();
	const { browser, page } = await attachSignedInApp();
	try {
		await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible({
			timeout: 60_000,
		});
		expect(new URL(page.url()).pathname).not.toMatch(/^\/auth\//);
		expect(await signedInProfileId(page)).toBe(liveAccounts.app);
	} finally {
		await browser.close();
	}
});
