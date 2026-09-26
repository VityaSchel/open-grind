import { join } from "node:path";

import { cleanersFor } from "./support/cleanup";
import {
	ensureAppInstalled,
	ensureEmulator,
	launchApp,
	prepareDevice,
} from "./support/device";
import { cleanUpLedger, Ledger } from "./support/ledger";
import { acquireRunLock } from "./support/lock";
import { clearStop, stopReason } from "./support/rate-limit";
import { attachSignedInApp } from "./support/session";
import { liveStatePaths } from "./support/state";

async function cleanUpLeftovers() {
	const ledger = new Ledger(liveStatePaths.ledger);
	if (stopReason() !== null || ledger.pending().length === 0) return;
	const { browser, page } = await attachSignedInApp();
	try {
		const { failed } = await cleanUpLedger({
			ledger,
			cleaners: cleanersFor(page),
			stopFile: liveStatePaths.stop,
		});
		for (const { entry } of failed) {
			console.warn(
				`Left behind ${entry.kind} ${entry.serverId}; run the sweep`,
			);
		}
	} finally {
		await browser.close();
	}
}

export default async function globalSetup() {
	const lock = acquireRunLock();
	try {
		clearStop();
		await ensureEmulator({
			logFile: join(liveStatePaths.dir, "emulator.log"),
		});
		prepareDevice();
		ensureAppInstalled();
		await launchApp();
	} catch (error) {
		lock.release();
		throw error;
	}

	return async () => {
		try {
			await cleanUpLeftovers();
		} finally {
			lock.release();
		}
	};
}
