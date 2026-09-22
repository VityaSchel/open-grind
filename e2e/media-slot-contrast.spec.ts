import { expect, type Page, test } from "@playwright/test";

import { openAlbum, TWO_ROW_ALBUM } from "./support/albums";

const NON_TEXT_CONTRAST = 3;

function iconContrastOverPhotos(page: Page, name: string) {
	return page.getByRole("button", { name }).evaluate((button) => {
		const context = document
			.createElement("canvas")
			.getContext("2d", { willReadFrequently: true });
		if (context === null) throw new Error("No canvas to resolve colors");
		const rgba = (css: string) => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = css;
			context.fillRect(0, 0, 1, 1);
			const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(
				0,
				0,
				1,
				1,
			).data;
			return { rgb: [r, g, b], alpha: a / 255 };
		};
		const over = (top: { rgb: number[]; alpha: number }, under: number[]) =>
			top.rgb.map(
				(channel, index) =>
					channel * top.alpha + (under[index] ?? 0) * (1 - top.alpha),
			);
		const luminance = (rgb: number[]) => {
			const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
				const s = channel / 255;
				return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		};
		const svg = button.querySelector("svg");
		if (svg === null) throw new Error("The button has no icon");
		const chip = rgba(getComputedStyle(button).backgroundColor);
		const icon = rgba(getComputedStyle(svg).color);
		return [
			[255, 255, 255],
			[128, 128, 128],
			[0, 0, 0],
		].map((photo) => {
			const behind = over(chip, photo);
			const [light, dark] = [
				luminance(over(icon, behind)),
				luminance(behind),
			].sort((a, b) => b - a);
			return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
		});
	});
}

test("remove and undo stay legible over light, gray and dark photos", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await openAlbum(page, TWO_ROW_ALBUM);
	for (const ratio of await iconContrastOverPhotos(
		page,
		"Remove album photo in slot 1",
	)) {
		expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
	}

	await page
		.getByRole("button", { name: "Remove album photo in slot 1" })
		.click();
	for (const ratio of await iconContrastOverPhotos(
		page,
		"Keep album photo in slot 1",
	)) {
		expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
	}
});
