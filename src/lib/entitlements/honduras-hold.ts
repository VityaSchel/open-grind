import { accountEpoch, isAccountEpochCurrent } from "$lib/api/account-caches";
import { updateLocation } from "$lib/api/browse/location";
import { callMethod } from "$lib/api/methods";
import { onSignOut } from "$lib/api/sign-out";
import {
	existsAppDataFile,
	removeAppDataFile,
	writeAppDataFileAtomic,
} from "$lib/app-data";
import { getPreferences } from "$lib/app-data/preferences.svelte";
import { isMobilePlatform } from "$lib/platform/os";
import { withDeadline } from "$lib/util/deadline";
import { ws } from "$lib/ws.svelte";
import { randomHondurasGeohash } from "./honduras";

const HOLD_TIMEOUT_MS = 15_000;
const SETTLE_WAIT_MS = 10_000;
const SIGN_OUT_WAIT_MS = 5_000;
const RETRY_MS = 60_000;
const MARKER = "honduras-hold.data";

export type LocationLease = { release: () => Promise<void> };

export type HondurasHold = { lease: () => LocationLease; ended: Promise<void> };

let writes: Promise<unknown> = Promise.resolve();
let latest: Hold | null = null;
const homeRequests = new Set<Promise<unknown>>();

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
	const run = writes.then(task);
	writes = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

class Hold {
	readonly ended: Promise<void>;
	readonly settled: Promise<void>;
	readonly #home: string;
	readonly #epoch = accountEpoch();
	readonly #watchesVisibility = isMobilePlatform();
	readonly #timer = setTimeout(() => void this.end(), HOLD_TIMEOUT_MS);
	#holders = 0;
	#over = false;
	#signedOut = false;
	#leftHome = false;
	#markEnded!: () => void;
	#markSettled!: () => void;

	readonly #endWhenHidden = () => {
		if (document.visibilityState === "hidden") void this.end();
	};

	constructor({ home }: { home: string }) {
		this.#home = home;
		this.ended = new Promise((resolve) => {
			this.#markEnded = resolve;
		});
		this.settled = new Promise((resolve) => {
			this.#markSettled = resolve;
		});
		if (this.#watchesVisibility) {
			document.addEventListener("visibilitychange", this.#endWhenHidden);
		}
	}

	get abandoned(): boolean {
		return this.#signedOut || !isAccountEpochCurrent(this.#epoch);
	}

	async take(): Promise<void> {
		await Promise.race([
			this.#enter(),
			this.ended.then(() => this.#throwIfOver()),
		]);
	}

	lease(): LocationLease {
		this.#holders += 1;
		let holding = true;
		return {
			release: () => {
				if (!holding) return Promise.resolve();
				holding = false;
				this.#holders -= 1;
				return this.#holders === 0 ? this.end() : Promise.resolve();
			},
		};
	}

	abandon(): Promise<void> {
		this.#signedOut = true;
		return this.end();
	}

	end(): Promise<void> {
		if (this.#over) return this.settled;
		this.#over = true;
		clearTimeout(this.#timer);
		if (this.#watchesVisibility) {
			document.removeEventListener(
				"visibilitychange",
				this.#endWhenHidden,
			);
		}
		this.#markEnded();
		void enqueueWrite(async () => {
			try {
				await this.#restore();
			} finally {
				if (latest === this) latest = null;
			}
		})
			.catch((error: unknown) => {
				console.error("Could not move back from Honduras", error);
				retryStrandedLocation(this.#epoch);
			})
			.finally(() => this.#markSettled());
		return this.settled;
	}

	async #enter(): Promise<void> {
		const geohash = randomHondurasGeohash();
		await enqueueWrite(async () => {
			await Promise.allSettled([...homeRequests]);
			this.#throwIfOver();
			this.#leftHome = true;
			await writeAppDataFileAtomic({
				path: MARKER,
				content: Uint8Array.of(1),
			});
			this.#throwIfOver();
			await updateLocation({ geohash });
		});
		this.#throwIfOver();
		await callMethod("refresh_session", { geohash });
	}

	async #restore(): Promise<void> {
		if (!this.#leftHome || !isAccountEpochCurrent(this.#epoch)) return;
		await updateLocation({ geohash: this.#home });
		await removeAppDataFile(MARKER);
	}

	#throwIfOver(): void {
		if (this.#over || this.abandoned) {
			throw new Error("The Honduras hold ended before it was granted");
		}
	}
}

export async function holdInHonduras({
	home,
}: {
	home: string;
}): Promise<HondurasHold | null> {
	const hold = new Hold({ home });
	latest = hold;
	try {
		await hold.take();
	} catch (error) {
		void hold.end();
		if (hold.abandoned) return null;
		throw error;
	}
	await Promise.race([ws.reconnect(), hold.ended]);
	if (!hold.abandoned) return hold;
	void hold.end();
	return null;
}

export async function awaitHomeLocation(): Promise<void> {
	let passed: Hold | null = null;
	while (latest !== null && latest !== passed) {
		const hold: Hold = latest;
		passed = hold;
		await hold.ended;
		await withDeadline({
			work: () => hold.settled,
			ms: SETTLE_WAIT_MS,
		}).catch(() => undefined);
	}
}

export async function atHomeLocation<T>(request: () => Promise<T>): Promise<T> {
	await awaitHomeLocation();
	const pending = request();
	homeRequests.add(pending);
	try {
		return await pending;
	} finally {
		homeRequests.delete(pending);
	}
}

function retryStrandedLocation(epoch: number): void {
	setTimeout(() => {
		if (!isAccountEpochCurrent(epoch)) return;
		restoreStrandedLocation().catch(() => undefined);
	}, RETRY_MS);
}

export function restoreStrandedLocation(): Promise<void> {
	const epoch = accountEpoch();
	const run = enqueueWrite(async () => {
		if (latest !== null || !isAccountEpochCurrent(epoch)) return;
		if (!(await existsAppDataFile(MARKER))) return;
		const { geohash } = await getPreferences();
		if (geohash !== null) await updateLocation({ geohash });
		await removeAppDataFile(MARKER);
	});
	run.catch(() => retryStrandedLocation(epoch));
	return run;
}

onSignOut(async () => {
	await withDeadline({
		work: async () => {
			await latest?.abandon();
			await restoreStrandedLocation();
		},
		ms: SIGN_OUT_WAIT_MS,
	}).catch((error: unknown) => {
		console.error(
			"Could not move back from Honduras before sign-out",
			error,
		);
	});
	await removeAppDataFile(MARKER);
});
