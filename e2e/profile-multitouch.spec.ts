import { expect, type Page, test } from "@playwright/test";

import { meTab } from "./support/app";
import {
	activeProfilePane,
	openGridProfile,
	type PagerGeometry,
	pagerGeometry,
	profilePager,
	profileUrl,
	restsOn,
	TrustedFingers,
} from "./support/profile-pager";

test.describe.configure({ timeout: 300_000 });

async function fingerLane(page: Page) {
	const pager = (await profilePager(page).boundingBox())!;
	const heading = (await activeProfilePane(page)
		.locator("h1")
		.boundingBox())!;
	const y = heading.y + heading.height / 2;
	return (fraction: number) => ({ x: pager.x + pager.width * fraction, y });
}

function offStop({ scrollLeft, width }: PagerGeometry): number {
	return Math.abs(scrollLeft - Math.round(scrollLeft / width) * width);
}

test("a finger still down outside the pager holds the landing until it lifts", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const at = await fingerLane(page);
	const fingers = await TrustedFingers.attach(page);
	const meTabBox = (await meTab(page).boundingBox())!;
	const outside = {
		x: meTabBox.x + meTabBox.width / 2,
		y: meTabBox.y + meTabBox.height / 2,
	};

	await fingers.down({ id: 1, ...at(0.8) });
	for (let step = 1; step <= 8; step++) {
		await fingers.move({ 1: at(0.8 - (0.4 * step) / 8) });
		await page.waitForTimeout(16);
	}
	await fingers.down({ id: 2, ...outside });
	await fingers.lift({ id: 1 });
	for (let x = outside.x; ; ) {
		const { scrollLeft, width } = await pagerGeometry(page);
		const remaining = 2 * width - scrollLeft;
		if (remaining < 1) break;
		x -= Math.min(remaining, 12);
		await fingers.move({ 2: { x, y: outside.y } });
		await page.waitForTimeout(16);
	}
	await page.waitForTimeout(300);
	expect(offStop(await pagerGeometry(page))).toBe(0);

	await expect(page, "a finger is still down").toHaveURL(
		profileUrl(tiles[1]!),
	);

	await fingers.lift({ id: 2 });

	await expect(page).toHaveURL(profileUrl(tiles[2]!));
	await restsOn(page, { position: 2 });
});
