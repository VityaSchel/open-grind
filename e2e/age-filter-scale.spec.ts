import { expect, type Page, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";

async function openAgeFilter(page: Page) {
	await page.setViewportSize({ width: 412, height: 915 });
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);

	await page.getByRole("button", { name: "Age", exact: true }).click();
	const dialog = page.getByRole("dialog");
	const thumbs = dialog.getByRole("slider", {
		name: /^(Minimum|Maximum) age$/,
	});
	await expect(thumbs).toHaveCount(2);
	await dialog.evaluate((node) =>
		Promise.all(
			node
				.getAnimations({ subtree: true })
				.map((animation) => animation.finished),
		),
	);
	const ages = () =>
		thumbs.evaluateAll((nodes) =>
			nodes.map((node) => Number(node.getAttribute("aria-valuenow"))),
		);
	return { dialog, thumbs, ages };
}

test("pressing the middle of the age track picks an age in the common range", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const { dialog, ages } = await openAgeFilter(page);
	expect(await ages()).toEqual([18, 99]);

	const track = dialog.locator('[data-slot="slider-track"]');
	const box = (await track.boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

	await expect
		.poll(async () =>
			(await ages()).filter((age) => age >= 38 && age <= 45),
		)
		.toHaveLength(1);
});

test("touching a thumb at either end of the age track keeps its age", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const { thumbs, ages } = await openAgeFilter(page);
	expect(await ages()).toEqual([18, 99]);

	for (const thumb of await thumbs.all()) {
		const box = (await thumb.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.up();
	}

	expect(await ages()).toEqual([18, 99]);
});
