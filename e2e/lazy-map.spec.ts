import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

test("leaflet is not loaded until the location picker opens", async ({
	page,
}) => {
	test.setTimeout(300_000);
	const leafletRequests: string[] = [];
	page.on("request", (request) => {
		if (/leaflet/i.test(request.url())) leafletRequests.push(request.url());
	});

	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await page.getByRole("button", { name: "Pick manually" }).waitFor();
	expect(leafletRequests).toEqual([]);

	await page.getByRole("button", { name: "Pick manually" }).click();
	await page
		.getByPlaceholder("Search places...")
		.waitFor({ timeout: 180_000 });
	expect(leafletRequests.length).toBeGreaterThan(0);
});
