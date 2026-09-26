import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures";
import { uniqueLiveName } from "./support/names";
import { navigateInApp } from "./support/navigation";
import { ownProfile, setShowDistance } from "./support/profile";

async function serverAboutMe(page: Page) {
	return (await ownProfile(page)).aboutMe ?? "";
}

async function saveAboutMe({ page, text }: { page: Page; text: string }) {
	await navigateInApp({ page, path: "/settings/profile" });
	const aboutMe = page.getByRole("textbox", { name: "About me" });
	await expect(aboutMe).toBeEditable({ timeout: 60_000 });
	await aboutMe.fill(text);
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect.poll(() => serverAboutMe(page)).toBe(text);
}

test("an About me edit reaches the server and is restored", async ({ app }) => {
	const original = await serverAboutMe(app);
	try {
		await saveAboutMe({ page: app, text: uniqueLiveName("about") });
	} finally {
		if ((await serverAboutMe(app)) !== original) {
			await saveAboutMe({ page: app, text: original });
		}
	}
});

test("the Show my distance switch reaches the server and is restored", async ({
	app,
}) => {
	const original = (await ownProfile(app)).showDistance;
	try {
		await navigateInApp({ page: app, path: "/settings/account/privacy" });
		const showDistance = app.getByRole("switch", {
			name: /Show my distance/,
		});
		await expect(showDistance).toBeEnabled({ timeout: 60_000 });
		await expect(showDistance).toBeChecked({ checked: original });
		await showDistance.click();
		await expect(showDistance).toBeChecked({ checked: !original });
		await expect
			.poll(async () => (await ownProfile(app)).showDistance)
			.toBe(!original);
	} finally {
		await setShowDistance({ page: app, showDistance: original });
	}
});
