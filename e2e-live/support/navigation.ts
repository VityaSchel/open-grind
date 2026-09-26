import type { Page } from "@playwright/test";

import { adb } from "./device";

export async function navigateInApp({
	page,
	path,
}: {
	page: Page;
	path: string;
}) {
	await page.evaluate((href) => {
		const link = document.createElement("a");
		link.href = href;
		link.hidden = true;
		document.body.append(link);
		link.click();
		link.remove();
	}, path);
	await page.waitForURL((url) => url.pathname === path);
}

export function pressSystemBack() {
	adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
}
