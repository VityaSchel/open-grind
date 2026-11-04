import type { BrowserContext, Locator } from "@playwright/test";

import { TrustedTouch } from "../../../e2e/support/app";

const LONG_PRESS_MS = 500;

export const touchscreens = new WeakSet<BrowserContext>();

function onTouchscreen(target: Locator): boolean {
	return touchscreens.has(target.page().context());
}

export async function press(target: Locator): Promise<void> {
	if (onTouchscreen(target)) await target.tap();
	else await target.click();
}

async function longPress({
	target,
	ready,
}: {
	target: Locator;
	ready: Locator;
}): Promise<void> {
	await target.tap({ trial: true });
	const box = await target.boundingBox();
	if (box === null) throw new Error("The long-pressed target has no box");
	const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	const page = target.page();
	const finger = await TrustedTouch.attach(page);
	await finger.start(at.x, at.y);
	try {
		await page.waitForTimeout(LONG_PRESS_MS);
		await page.evaluate(({ x, y }) => {
			document
				.elementFromPoint(x, y)
				?.dispatchEvent(
					new PointerEvent("contextmenu", {
						bubbles: true,
						cancelable: true,
						composed: true,
						clientX: x,
						clientY: y,
						pointerType: "touch",
					}),
				);
		}, at);
		await ready.waitFor();
	} finally {
		await finger.cancel();
	}
}

export async function openContextMenu({
	target,
	ready,
}: {
	target: Locator;
	ready: Locator;
}): Promise<void> {
	if (onTouchscreen(target)) {
		await longPress({ target, ready });
		return;
	}
	await target.click({ button: "right" });
	await ready.waitFor();
}
