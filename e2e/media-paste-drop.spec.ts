import {
	expect,
	type JSHandle,
	type Locator,
	type Page,
	test,
} from "@playwright/test";

import { MEDIA_SLOT, openSharedAlbum } from "./support/albums";
import {
	DEMO_CONVERSATION,
	installTauriShim,
	MESSAGE_ROW,
} from "./support/app";
import { DRAWER } from "./support/drawer";

const OVERLAY = '[data-slot="media-drop-overlay"]';
const SPLIT_LAYOUT = '[data-slot="resizable-pane-group"]';
const PREVIEW_BOX = '[data-slot="send-media-preview"]';
const PHOTO_PREVIEW = "Preview of the photo to send";
const HAVE_CURRENT_DATA = 2;

const PNG = {
	name: "pasted.png",
	type: "image/png",
	base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
};

const GIF = {
	name: "loop.gif",
	type: "image/gif",
	base64: "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
};

const PDF = {
	name: "notes.pdf",
	type: "application/pdf",
	base64: "JVBERi0xLjQK",
};

type FileSpec = typeof PNG;

async function transferOf(
	page: Page,
	...files: FileSpec[]
): Promise<JSHandle<DataTransfer>> {
	return page.evaluateHandle((files) => {
		const transfer = new DataTransfer();
		for (const { name, type, base64 } of files) {
			const bytes = Uint8Array.from(atob(base64), (char) =>
				char.charCodeAt(0),
			);
			transfer.items.add(new File([bytes], name, { type }));
		}
		return transfer;
	}, files);
}

function bottomOf(locator: Locator): Promise<number> {
	return locator.evaluate(
		(element) => element.getBoundingClientRect().bottom,
	);
}

async function openChat(page: Page) {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	const composer = page.getByPlaceholder("Say something...");
	await composer.waitFor({ timeout: 30_000 });
	return composer;
}

async function drawnPhoto(
	page: Page,
	size: { width: number; height: number },
): Promise<JSHandle<DataTransfer>> {
	return page.evaluateHandle(async ({ width, height }) => {
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");
		if (context === null) throw new Error("No 2D context");
		context.fillStyle = "#3a7";
		context.fillRect(0, 0, width, height);
		const blob = await canvas.convertToBlob({ type: "image/png" });
		const transfer = new DataTransfer();
		transfer.items.add(
			new File([blob], "drawn.png", { type: "image/png" }),
		);
		return transfer;
	}, size);
}

async function recordedVideo(page: Page): Promise<JSHandle<DataTransfer>> {
	return page.evaluateHandle(async () => {
		const canvas = document.createElement("canvas");
		canvas.width = 64;
		canvas.height = 48;
		const context = canvas.getContext("2d");
		if (context === null) throw new Error("No 2D context");
		const recorder = new MediaRecorder(canvas.captureStream(30), {
			mimeType: "video/webm",
		});
		const chunks: Blob[] = [];
		recorder.ondataavailable = (event) => chunks.push(event.data);
		const stopped = new Promise((resolve) => (recorder.onstop = resolve));
		recorder.start();
		for (let frame = 0; frame < 10; frame++) {
			context.fillStyle = `rgb(${frame * 25}, 80, 160)`;
			context.fillRect(0, 0, 64, 48);
			await new Promise((resolve) => setTimeout(resolve, 30));
		}
		recorder.stop();
		await stopped;
		const transfer = new DataTransfer();
		transfer.items.add(
			new File(chunks, "clip.webm", { type: "video/webm" }),
		);
		return transfer;
	});
}

async function paste(page: Page, file: FileSpec | JSHandle<DataTransfer>) {
	const clipboardData =
		"base64" in file ? await transferOf(page, file) : file;
	await page.getByPlaceholder("Say something...").evaluate((input, data) => {
		input.dispatchEvent(
			new ClipboardEvent("paste", {
				clipboardData: data,
				bubbles: true,
				cancelable: true,
			}),
		);
	}, clipboardData);
}

function sendDialog(page: Page) {
	return page.getByRole("alertdialog");
}

test.describe("pasting and dropping media", () => {
	test("a pasted photo is previewed, then sent on Send", async ({ page }) => {
		const composer = await openChat(page);
		await composer.fill("hello");
		const rows = await page.locator(MESSAGE_ROW).count();

		await paste(page, PNG);

		const dialog = sendDialog(page);
		await expect(dialog).toHaveAccessibleName(PHOTO_PREVIEW);
		await expect(dialog.getByRole("img")).toHaveAttribute(
			"src",
			/^data:image\//,
		);
		await dialog.getByRole("button", { name: "Send" }).click();

		await expect(dialog).toHaveCount(0);
		await expect(page.locator(MESSAGE_ROW)).toHaveCount(rows + 1, {
			timeout: 15_000,
		});
		await expect(composer, "the typed text stays put").toHaveValue("hello");
		await expect(page.locator(DRAWER)).toHaveCount(0);
	});

	test("a pasted GIF goes out as a photo", async ({ page }) => {
		await openChat(page);
		const rows = await page.locator(MESSAGE_ROW).count();

		await paste(page, GIF);
		const dialog = sendDialog(page);
		await expect(dialog).toHaveAccessibleName(PHOTO_PREVIEW);
		await dialog.getByRole("button", { name: "Send" }).click();

		await expect(page.locator(MESSAGE_ROW)).toHaveCount(rows + 1, {
			timeout: 15_000,
		});
	});

	test("cancelling a paste sends nothing", async ({ page }) => {
		await openChat(page);
		const rows = await page.locator(MESSAGE_ROW).count();

		await paste(page, PNG);
		const dialog = sendDialog(page);
		await dialog.getByRole("button", { name: "Cancel" }).click();

		await expect(dialog).toHaveCount(0);
		await expect(page.locator(MESSAGE_ROW)).toHaveCount(rows);
	});

	test("a single preview opens at the photo's shape, before the preview decodes", async ({
		page,
	}) => {
		await openChat(page);

		await paste(page, await drawnPhoto(page, { width: 400, height: 200 }));

		const dialog = sendDialog(page);
		const box = dialog.locator(PREVIEW_BOX);
		await expect(box).toHaveCSS("aspect-ratio", "400 / 200");
		await expect(dialog.getByRole("img")).toBeVisible();
		const { framed, shown } = await box.evaluate((element) => ({
			framed: element.getBoundingClientRect().toJSON() as DOMRect,
			shown: element
				.querySelector("img")
				?.getBoundingClientRect()
				.toJSON() as DOMRect,
		}));
		expect(shown, "the photo fills the box it opened with").toEqual(framed);
		expect(framed.width / framed.height).toBeCloseTo(2, 1);
	});

	test("the preview's corners run parallel to the dialog's", async ({
		page,
	}) => {
		await openChat(page);

		await paste(page, PNG);

		const dialog = sendDialog(page);
		const radii = await dialog.locator(PREVIEW_BOX).evaluate((element) => {
			const content = element.closest('[role="alertdialog"]');
			if (content === null) throw new Error("No dialog");
			const outer = getComputedStyle(content);
			return {
				expected:
					parseFloat(outer.borderTopLeftRadius) -
					parseFloat(outer.paddingTop),
				actual: parseFloat(
					getComputedStyle(element).borderTopLeftRadius,
				),
			};
		});
		expect(radii.expected).toBeGreaterThan(0);
		expect(radii.actual).toBeCloseTo(radii.expected, 1);
	});

	test("a pasted video shows its first frame", async ({ page }) => {
		await openChat(page);

		await paste(page, await recordedVideo(page));

		const dialog = sendDialog(page);
		await expect(dialog).toHaveAccessibleName(
			"Preview of the video to send",
		);
		const video = dialog.locator("video");
		await expect(video).toHaveAttribute("src", /^blob:/);
		await expect
			.poll(() =>
				video.evaluate(
					(element: HTMLVideoElement) => element.readyState,
				),
			)
			.toBeGreaterThanOrEqual(HAVE_CURRENT_DATA);
	});

	test("the send dialog survives switching between the phone and desktop layouts", async ({
		page,
	}) => {
		await openChat(page);
		await paste(page, PNG);
		const dialog = sendDialog(page);
		await expect(dialog.getByRole("img")).toBeVisible();

		await page.setViewportSize({ width: 1024, height: 800 });
		await expect(page.locator(SPLIT_LAYOUT)).toHaveCount(1);
		await expect(dialog.getByRole("img")).toBeVisible();

		await page.setViewportSize({ width: 420, height: 800 });
		await expect(page.locator(SPLIT_LAYOUT)).toHaveCount(0);
		await expect(dialog).toHaveAccessibleName(PHOTO_PREVIEW);
		const rows = await page.locator(MESSAGE_ROW).count();
		await dialog.getByRole("button", { name: "Send" }).click();

		await expect(dialog).toHaveCount(0);
		await expect(page.locator(MESSAGE_ROW)).toHaveCount(rows + 1, {
			timeout: 15_000,
		});
	});

	test("dragging a file over a chat says where it goes, and dropping asks to send it", async ({
		page,
	}) => {
		await openChat(page);
		const dataTransfer = await transferOf(page, PNG);

		await page.dispatchEvent("body", "dragenter", { dataTransfer });
		await expect(page.locator(OVERLAY)).toHaveText("Drop to send");
		const clearance = await page.evaluate(() => {
			const zone = document
				.querySelector('[data-slot="media-drop-zone"]')
				?.getBoundingClientRect();
			const [top, bottom] = [
				...document.querySelectorAll('[data-slot="safe-area-strip"]'),
			].map((strip) => strip.getBoundingClientRect());
			if (zone === undefined || top === undefined || bottom === undefined)
				throw new Error("Missing drop zone or safe-area strips");
			return {
				above: zone.top - top.bottom,
				below: bottom.top - zone.bottom,
				insets: top.height + bottom.height,
			};
		});
		expect(clearance.insets, "the run fakes system bars").toBeGreaterThan(
			0,
		);
		expect(clearance.above).toBeGreaterThanOrEqual(16);
		expect(clearance.below).toBeGreaterThanOrEqual(16);
		await page.dispatchEvent("body", "drop", { dataTransfer });

		await expect(page.locator(OVERLAY)).toHaveCount(0);
		await expect(sendDialog(page)).toHaveAccessibleName(PHOTO_PREVIEW);
	});

	test("a toast shows over the send dialog, low while it hides the bars, and moves back up once it closes", async ({
		page,
	}) => {
		await openChat(page);
		await paste(page, PNG);
		const dialog = sendDialog(page);
		await expect(dialog.getByRole("img")).toBeVisible();

		await paste(page, PDF);

		const toast = page.locator("[data-sonner-toast]", {
			hasText: "That file isn't a photo or video",
		});
		await expect(toast).toBeVisible();
		const onTop = await toast.evaluate((element) => {
			const box = element.getBoundingClientRect();
			const hit = document.elementFromPoint(
				box.left + box.width / 2,
				box.top + box.height / 2,
			);
			return element.contains(hit);
		});
		expect(onTop, "nothing covers the toast").toBe(true);
		const lowered = await bottomOf(toast);

		await dialog.getByRole("button", { name: "Cancel" }).click();

		await expect(dialog).toHaveCount(0);
		await expect.poll(() => bottomOf(toast)).toBeLessThan(lowered - 16);
	});

	test("dragging more files over the send dialog shows the drop overlay above it and adds them", async ({
		page,
	}) => {
		await openChat(page);
		await paste(page, PNG);
		const dialog = sendDialog(page);
		await expect(dialog.getByRole("img")).toBeVisible();
		const dataTransfer = await transferOf(page, PNG);

		await page.dispatchEvent("body", "dragenter", { dataTransfer });

		const overlay = page.locator(OVERLAY);
		await expect(overlay).toHaveText("Drop to send");
		const layerOf = (locator: Locator) =>
			locator.evaluate((element) =>
				Number(getComputedStyle(element).zIndex),
			);
		expect(await layerOf(overlay)).toBeGreaterThan(await layerOf(dialog));
		await page.dispatchEvent("body", "drop", { dataTransfer });

		await expect(overlay).toHaveCount(0);
		await expect(dialog).toHaveAccessibleName(
			"Preview of 2 photos to send",
		);
	});

	test("many photos scroll inside the send dialog and keep Send on screen", async ({
		page,
	}) => {
		await openChat(page);

		await paste(page, await transferOf(page, ...Array(8).fill(PNG)));

		const dialog = sendDialog(page);
		await expect(dialog).toHaveAccessibleName(
			"Preview of 8 photos to send",
		);
		await expect(
			dialog.getByRole("button", { name: "Send" }),
		).toBeInViewport({ ratio: 1 });
		const previews = dialog.locator('[data-slot="send-media-previews"]');
		await expect
			.poll(() =>
				previews.evaluate(
					(element) => element.scrollHeight > element.clientHeight,
				),
			)
			.toBe(true);
		const overlaps = await previews.evaluate((element) => {
			const tiles = [...element.children].map((tile) =>
				tile.getBoundingClientRect(),
			);
			return tiles.filter((tile, index) => {
				const below = tiles[index + 2];
				return below !== undefined && tile.bottom > below.top + 0.5;
			}).length;
		});
		expect(overlaps, "no tile runs into the row below it").toBe(0);
	});

	test("a photo that can't be read leaves the send dialog with a reason", async ({
		page,
	}) => {
		await openChat(page);

		await paste(page, {
			name: "broken.png",
			type: "image/png",
			base64: "AAAAAAAA",
		});

		await expect(
			page.locator("[data-sonner-toast]", {
				hasText: "Couldn't read that photo",
			}),
		).toBeVisible();
		await expect(sendDialog(page)).toHaveCount(0);
	});

	test("dragging files that are no photo or video says so before the drop", async ({
		page,
	}) => {
		await openChat(page);
		const dataTransfer = await transferOf(page, PDF);

		await page.dispatchEvent("body", "dragenter", { dataTransfer });

		await expect(page.locator(OVERLAY)).toHaveText(
			"Only photos and videos can be dropped here",
		);
	});

	test("a photo dropped on an album lands in it", async ({ page }) => {
		await openSharedAlbum(page);
		await expect(page.locator(MEDIA_SLOT)).toHaveCount(3);
		const dataTransfer = await transferOf(page, PNG);

		await page.dispatchEvent("body", "dragenter", { dataTransfer });
		await expect(page.locator(OVERLAY)).toHaveText("Drop to add to album");
		await page.dispatchEvent("body", "drop", { dataTransfer });

		await expect(page.locator(MEDIA_SLOT)).toHaveCount(4, {
			timeout: 30_000,
		});
	});
});
