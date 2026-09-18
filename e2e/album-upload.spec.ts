import { expect, type Page, test } from "@playwright/test";

import {
	albumTileNamed,
	back,
	MEDIA_SLOT,
	openAlbums,
	openSharedAlbum,
} from "./support/albums";

const PENDING_TILE = `${MEDIA_SLOT} [data-slot="media-image-pending"]`;

type UploadTrace = { peak: number; leading: number; saveDisabled: boolean };

declare global {
	interface Window {
		__uploadTrace?: UploadTrace;
	}
}

const TINY_PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const TINY_MP4 = "AAAAGGZ0eXBpc29tAAACAGlzb21pc28y";

const SAVE = "Save changes";

function photoFile(name: string) {
	return {
		name,
		mimeType: "image/png",
		buffer: Buffer.from(TINY_PNG, "base64"),
	};
}

function videoFile(name: string) {
	return {
		name,
		mimeType: "video/mp4",
		buffer: Buffer.from(TINY_MP4, "base64"),
	};
}

async function traceUploads(page: Page): Promise<() => Promise<UploadTrace>> {
	await page.evaluate((save) => {
		const trace: UploadTrace = { peak: 0, leading: 0, saveDisabled: false };
		window.__uploadTrace = trace;
		const sample = () => {
			const slots = [
				...document.querySelectorAll('[data-slot="media-slot"]'),
			];
			const pending = slots.filter(
				(slot) =>
					slot.querySelector('[data-slot="media-image-pending"]') !==
					null,
			);
			if (pending.length === 0) return;
			trace.peak = Math.max(trace.peak, pending.length);
			const settled = slots.findIndex((slot) => !pending.includes(slot));
			trace.leading = Math.max(
				trace.leading,
				settled === -1 ? slots.length : settled,
			);
			const button = [...document.querySelectorAll("button")].find(
				(candidate) => candidate.textContent?.includes(save) === true,
			);
			if (button?.disabled === true) trace.saveDisabled = true;
		};
		sample();
		new MutationObserver(sample).observe(document.body, {
			subtree: true,
			childList: true,
			attributes: true,
		});
	}, SAVE);
	return () =>
		page.evaluate(
			() =>
				window.__uploadTrace ?? {
					peak: 0,
					leading: 0,
					saveDisabled: false,
				},
		);
}

async function addMedia(
	page: Page,
	files: { name: string; mimeType: string; buffer: Buffer }[],
): Promise<void> {
	const chooser = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Add photos or videos" }).click();
	await (await chooser).setFiles(files);
}

test.describe("album uploads", () => {
	test("two photos upload as pending tiles, then lead the album", async ({
		page,
	}) => {
		await openSharedAlbum(page);
		await expect(page.locator(MEDIA_SLOT)).toHaveCount(3);
		await expect(page.getByText("3/10 photos, 0/1 videos")).toBeVisible();

		const trace = await traceUploads(page);
		await addMedia(page, [photoFile("one.png"), photoFile("two.png")]);
		await expect(page.locator(MEDIA_SLOT)).toHaveCount(5, {
			timeout: 30_000,
		});

		const { peak, leading } = await trace();
		expect(peak, "both picks showed as pending tiles").toBe(2);
		expect(leading, "the pending tiles led the grid").toBe(2);
		await expect(page.getByText("5/10 photos, 0/1 videos")).toBeVisible();
		await expect(
			page.locator(`${MEDIA_SLOT} img`).first(),
			"the newest upload leads the grid once it lands",
		).toHaveAttribute("src", /album-903-51/);
		await expect(
			page.getByRole("button", {
				name: /^Remove album photo in slot 1$/,
			}),
			"a landed upload can be removed again",
		).toBeVisible();
	});

	test("a video stays pending until the server finishes processing it", async ({
		page,
	}) => {
		await openSharedAlbum(page);

		await addMedia(page, [videoFile("clip.mp4")]);
		await expect(
			page.getByRole("img", {
				name: "Album video in slot 1, processing",
				exact: true,
			}),
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(MEDIA_SLOT)).toHaveCount(4);

		await expect(
			page.getByRole("img", {
				name: "Album video in slot 1",
				exact: true,
			}),
			"the processing watcher swaps in the finished video",
		).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(MEDIA_SLOT)).toHaveCount(4);
		await expect(page.locator(PENDING_TILE)).toHaveCount(0);
		await expect(page.getByText("3/10 photos, 1/1 videos")).toBeVisible();
	});

	test("saving waits for the uploads in flight", async ({ page }) => {
		await openSharedAlbum(page);
		await page
			.getByRole("textbox", { name: "Album name" })
			.fill("Darkroom");

		const save = page.getByRole("button", { name: SAVE });
		await expect(save).toBeEnabled();

		const trace = await traceUploads(page);
		await addMedia(page, [photoFile("one.png")]);
		await expect(page.locator(MEDIA_SLOT)).toHaveCount(4, {
			timeout: 30_000,
		});

		expect(
			(await trace()).saveDisabled,
			"save was disabled while the upload was in flight",
		).toBe(true);
		await expect(
			save,
			"save arms again once nothing is pending",
		).toBeEnabled();
		await save.click();
		await expect(save).toBeHidden({ timeout: 30_000 });
	});

	test("a pick past the album's video limit is left out with a toast", async ({
		page,
	}) => {
		await openSharedAlbum(page);

		await addMedia(page, [videoFile("one.mp4"), videoFile("two.mp4")]);

		await expect(
			page.getByText(
				"You can have 1 video in your album. Remove one to add another.",
			),
		).toBeVisible({ timeout: 30_000 });
		await expect(
			page.locator(MEDIA_SLOT),
			"only the video that fits was uploaded",
		).toHaveCount(4);
	});

	test("a new album is created by its first photo", async ({ page }) => {
		await openAlbums(page);
		await page.getByRole("link", { name: "Add album" }).click();
		await expect(page).toHaveURL(/\/albums\/new$/);
		await page.getByRole("textbox", { name: "Album name" }).fill("Rooftop");

		await addMedia(page, [photoFile("one.png")]);

		await expect(page).toHaveURL(/\/albums\/\d+$/, { timeout: 30_000 });
		await expect(
			page.getByRole("textbox", { name: "Album name" }),
			"the typed name travels to the created album",
		).toHaveValue("Rooftop");
		await expect(page.locator(MEDIA_SLOT)).toHaveCount(1, {
			timeout: 30_000,
		});
		await expect(page.getByText("1/10 photos, 0/1 videos")).toBeVisible();

		await back(page);
		await expect(
			page.locator(albumTileNamed("Rooftop")),
			"the new album shows on My Albums",
		).toBeVisible();
	});
});
