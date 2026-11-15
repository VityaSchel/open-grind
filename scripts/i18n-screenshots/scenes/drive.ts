import type { Locator, Page } from "@playwright/test";

import type { ScreenshotScene } from "../../../src/lib/demo/screenshot-scene";
import { generatedPhotos, generatedVideos } from "../images";

export const ALERT = '[role="alertdialog"]';

export async function scrollToCenter(target: Locator): Promise<void> {
	await target.evaluate((element) =>
		element.scrollIntoView({ block: "center", behavior: "instant" }),
	);
}

export async function changeScene({
	page,
	scene,
}: {
	page: Page;
	scene: Partial<ScreenshotScene>;
}): Promise<void> {
	await page.evaluate((changed) => {
		const hooks = window.__openGrindScreenshots;
		if (hooks === undefined) {
			throw new Error("The build installed no screenshot hooks");
		}
		hooks.setScene(changed);
	}, scene);
}

export async function emitEvent({
	page,
	event,
	payload,
}: {
	page: Page;
	event: string;
	payload: unknown;
}): Promise<void> {
	await page.evaluate(
		({ name, sent }) => {
			if (window.__emitTauriEvent === undefined) {
				throw new Error("Tauri events cannot be emitted on this page");
			}
			window.__emitTauriEvent(name, sent);
		},
		{ name: event, sent: payload },
	);
}

export async function chooseGeneratedMedia({
	page,
	open,
	photos = 1,
	videos = 0,
}: {
	page: Page;
	open: () => Promise<void>;
	photos?: number;
	videos?: number;
}): Promise<void> {
	const [chooser] = await Promise.all([
		page.waitForEvent("filechooser"),
		open(),
	]);
	await chooser.setFiles([
		...(await generatedPhotos(photos)),
		...(await generatedVideos(videos)),
	]);
}
