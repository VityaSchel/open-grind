import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { DRAWER, MEDIA_TILE } from "./support/drawer";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";

const CONVERSATION = "/chat/100006:123456000";
const SCROLLER = '[data-slot="messages-scroller"]';
const ROW = '[role="button"][tabindex="0"]';
const PHOTO = 'a[aria-label="Photo"]';

// ms-3/me-3: the gutter a message keeps against the conversation edge
const GUTTER = 12;
// ImageMessage sizes itself `w-2/5 min-w-35 max-w-60`, and min-w-35 is 8.75rem
const MIN_WIDTH = 140;

type Photo = { isOut: boolean; left: number; right: number; width: number };
type Geometry = { contentLeft: number; contentRight: number; photos: Photo[] };

function measurePhotos(page: Page): Promise<Geometry> {
	return page.evaluate(
		({ scroller, row, photo }): Geometry => {
			const messages = document.querySelector(scroller);
			if (!messages) throw new Error("the messages scroller is missing");
			const box = messages.getBoundingClientRect();
			const style = getComputedStyle(messages);
			return {
				contentLeft: box.left + parseFloat(style.paddingLeft),
				contentRight: box.right - parseFloat(style.paddingRight),
				photos: [...document.querySelectorAll(row)].flatMap((each) => {
					const image = each.querySelector(photo);
					if (!image) return [];
					const { left, right, width } =
						image.getBoundingClientRect();
					// only an outgoing row pads its start
					const isOut =
						parseFloat(getComputedStyle(each).paddingInlineStart) >
						0;
					return [{ isOut, left, right, width }];
				}),
			};
		},
		{ scroller: SCROLLER, row: ROW, photo: PHOTO },
	);
}

async function sendAPhoto(page: Page) {
	await page.getByRole("button", { name: "Add attachment" }).click();
	await page.locator(DRAWER).waitFor({ timeout: 10_000 });
	const tile = page.locator(MEDIA_TILE).first();
	await expect(tile).toBeVisible({ timeout: 30_000 });
	await tile.click();
	await page.getByRole("button", { name: /^Send/ }).click();
	await expect(page.locator(DRAWER)).toBeHidden();
}

test("a sent photo hugs its own edge and is as wide as a received one", async ({
	page,
}) => {
	await serveImages(page, CHAT_MEDIA_HOST);
	await installTauriShim(page);
	await page.goto(CONVERSATION);
	await page.locator(SCROLLER).waitFor({ timeout: 30_000 });
	await expect(page.locator(PHOTO)).toHaveCount(1, { timeout: 30_000 });

	await sendAPhoto(page);
	await expect(page.locator(PHOTO)).toHaveCount(2, { timeout: 30_000 });

	const { contentLeft, contentRight, photos } = await measurePhotos(page);
	const received = photos.find((photo) => !photo.isOut);
	const sent = photos.find((photo) => photo.isOut);
	if (!received) throw new Error("the received photo did not render");
	if (!sent) throw new Error("the sent photo did not render");

	expect
		.soft(
			received.width,
			"the received photo is the yardstick, so its 2/5 width must not itself be collapsed to min-w-35",
		)
		.toBeGreaterThan(MIN_WIDTH);
	expect
		.soft(
			received.left - contentLeft,
			"a received photo sits one gutter from the conversation's left edge",
		)
		.toBeCloseTo(GUTTER, 0);
	expect
		.soft(
			contentRight - sent.right,
			"a sent photo sits no further than one gutter from the conversation's right edge",
		)
		.toBeLessThanOrEqual(GUTTER + 0.5);
	expect
		.soft(sent.width, "a sent photo is as wide as a received one")
		.toBeCloseTo(received.width, 0);
});
