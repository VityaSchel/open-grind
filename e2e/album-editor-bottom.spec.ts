import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	MEDIA_SLOT,
	openAlbum,
	SHARED_ALBUM,
	TWO_ROW_ALBUM,
} from "./support/albums";
import { installTauriShim } from "./support/app";

const SAVE_BAR = '[data-slot="save-changes-bar"]';
const SCROLLER = '[data-slot="subpage-scroller"]';
const SHORT_PHONE = { width: 420, height: 600 };
const BLUR_MODES = [undefined, "min"] as const;

async function box(locator: Locator) {
	const measured = await locator.boundingBox();
	if (!measured) throw new Error("Nothing to measure");
	return measured;
}

async function scrollTo({ page, end }: { page: Page; end: boolean }) {
	await page.locator(SCROLLER).evaluate(
		(scroller, toEnd) =>
			new Promise((settled) => {
				scroller.scrollTop = toEnd ? scroller.scrollHeight : 0;
				requestAnimationFrame(() => requestAnimationFrame(settled));
			}),
		end,
	);
}

async function makeDirty({
	page,
	edit,
}: {
	page: Page;
	edit: () => Promise<void>;
}) {
	const saveBarShown = page.evaluate(
		(saveBar) =>
			new Promise<void>((shown) => {
				const settle = ({ target }: Event) => {
					if (
						!(target instanceof Element) ||
						!target.matches(saveBar)
					)
						return;
					document.removeEventListener("introend", settle, true);
					shown();
				};
				document.addEventListener("introend", settle, true);
			}),
		SAVE_BAR,
	);
	await edit();
	await saveBarShown;
}

async function setBlurMode({
	page,
	mode,
}: {
	page: Page;
	mode: (typeof BLUR_MODES)[number];
}) {
	await page.evaluate((blur) => {
		if (blur) document.documentElement.dataset.backdropBlur = blur;
		else delete document.documentElement.dataset.backdropBlur;
	}, mode);
}

async function expectSaveBarRestsBelow({
	page,
	lastContent,
}: {
	page: Page;
	lastContent: Locator;
}) {
	const bar = page.locator(SAVE_BAR);
	const save = page.getByRole("button", { name: "Save changes" });
	const rowGap = await bar.evaluate((element) =>
		parseFloat(getComputedStyle(element.parentElement!).rowGap),
	);
	for (const mode of BLUR_MODES) {
		await setBlurMode({ page, mode });
		await scrollTo({ page, end: false });
		const stuck = await box(save);
		expect((await box(lastContent)).y).toBeGreaterThan(stuck.y);

		await scrollTo({ page, end: true });
		const rested = await box(save);
		expect(Math.abs(rested.y - stuck.y)).toBeLessThanOrEqual(1);

		const content = await box(lastContent);
		const barTop = (await box(bar)).y;
		expect(content.y + content.height).toBeLessThanOrEqual(barTop + 1);
		expect(
			Math.abs(rested.y - (content.y + content.height) - rowGap),
		).toBeLessThanOrEqual(1);
	}
}

test.describe("scrolled to the bottom with unsaved changes", () => {
	test.use({ viewport: SHORT_PHONE });

	test("the album save button rests where it sticks, right below the last media row", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await openAlbum(page, TWO_ROW_ALBUM);
		await makeDirty({
			page,
			edit: () =>
				page
					.getByRole("button", {
						name: /^Remove album photo in slot 1$/,
					})
					.click(),
		});
		await expectSaveBarRestsBelow({
			page,
			lastContent: page.locator(MEDIA_SLOT).last(),
		});
	});

	test("the profile save button rests where it sticks, right below the last section", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await installTauriShim(page);
		await page.goto("/settings/profile");
		const displayName = page.getByRole("textbox", { name: "Display name" });
		await displayName.waitFor({ timeout: 60_000 });
		await makeDirty({
			page,
			edit: () => displayName.fill("Renamed in a test"),
		});
		await expectSaveBarRestsBelow({
			page,
			lastContent: page
				.locator("section")
				.filter({ has: page.getByRole("heading", { name: "Social" }) }),
		});
	});
});

test("on a short album the save button sits where it sticks on a long one", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 420, height: 1100 });
	await openAlbum(page, SHARED_ALBUM);
	await makeDirty({
		page,
		edit: () =>
			page
				.getByRole("button", { name: /^Remove album photo in slot 1$/ })
				.click(),
	});
	const bar = page.locator(SAVE_BAR);
	const distanceFromBottom = () =>
		bar.evaluate((element) =>
			Math.round(
				window.innerHeight - element.getBoundingClientRect().bottom,
			),
		);
	expect(
		await page
			.locator(SCROLLER)
			.evaluate(
				(scroller) => scroller.scrollHeight > scroller.clientHeight,
			),
		"the album fits without scrolling",
	).toBe(false);
	const resting = await distanceFromBottom();

	await page.setViewportSize({ width: 420, height: 520 });
	await scrollTo({ page, end: false });
	expect(await distanceFromBottom()).toBe(resting);
});
