import { test as base, type Page } from "@playwright/test";

import { rateLimitsSeen } from "./app";
import { cleanersFor } from "./cleanup";
import type { AttachedApp } from "./device";
import { cleanUpLedger, Ledger } from "./ledger";
import { stopForRateLimit, stopReason } from "./rate-limit";
import { attachSignedInApp } from "./session";
import { liveStatePaths } from "./state";

async function stopIfTheAppWasRateLimited({
	page,
	stopFile,
}: {
	page: Page;
	stopFile: string;
}) {
	const rateLimits = await rateLimitsSeen(page).catch(() => 0);
	return rateLimits > 0
		? stopForRateLimit("the app", { file: stopFile })
		: null;
}

export const test = base.extend<{
	liveState: typeof liveStatePaths;
	runGate: void;
	attached: AttachedApp;
	app: Page;
	ledger: Ledger;
}>({
	liveState: [liveStatePaths, { option: true }],
	runGate: [
		async ({ liveState }, use, testInfo) => {
			const reason = stopReason(liveState.stop);
			testInfo.skip(reason !== null, `The live run stopped: ${reason}`);
			await use();
		},
		{ auto: true },
	],
	attached: async ({ liveState }, use) => {
		const attached = await attachSignedInApp();
		await use(attached);
		const rateLimited = await stopIfTheAppWasRateLimited({
			page: attached.page,
			stopFile: liveState.stop,
		});
		await attached.browser.close().catch(() => {});
		if (rateLimited !== null) throw rateLimited;
	},
	app: async ({ attached }, use) => {
		await use(attached.page);
	},
	ledger: async ({ attached, liveState }, use) => {
		const ledger = new Ledger(liveState.ledger);
		await use(ledger);
		await stopIfTheAppWasRateLimited({
			page: attached.page,
			stopFile: liveState.stop,
		});
		const { failed } = await cleanUpLedger({
			ledger,
			cleaners: cleanersFor(attached.page),
			stopFile: liveState.stop,
		});
		for (const { entry } of failed) {
			console.warn(`Left behind ${entry.kind} ${entry.serverId}`);
		}
	},
});

export { expect } from "@playwright/test";
