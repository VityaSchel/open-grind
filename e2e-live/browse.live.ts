import { expect, test } from "./support/fixtures";
import { ensureDeviceLocation } from "./support/location";
import { navigateInApp, pressSystemBack } from "./support/navigation";

test("a Browse tile opens a profile and system Back returns to the grid", async ({
	app,
}) => {
	await navigateInApp({ page: app, path: "/settings/app" });
	await expect(
		app.getByRole("switch", { name: /Reveal profile views/ }),
		"opening a stranger's profile must not record a view",
	).not.toBeChecked();

	await ensureDeviceLocation(app);
	const tile = app.locator('a[href^="/profile/"]').first();
	const profilePath = await tile.getAttribute("href");
	await tile.click();
	await expect.poll(() => new URL(app.url()).pathname).toBe(profilePath);

	pressSystemBack();
	await expect.poll(() => new URL(app.url()).pathname).toBe("/");
	await expect(app.locator('a[href^="/profile/"]').first()).toBeVisible();
});
