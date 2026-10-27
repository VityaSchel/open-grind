import { currentPlatform, type SupportedPlatform } from "$lib/platform/os";

const MIN_ANDROID_INTERCEPT_WORKERS = 3;
const CORES_WITHOUT_ANDROID_INTERCEPT_WORKER = 2;
const INTERCEPT_WORKERS_KEPT_FOR_BYTE_DELIVERY = 1;
const DETACHED_LOAD_TIMEOUT_MS = 30_000;

export function mediaLoadCapacity({
	platform,
	cores,
}: {
	platform: SupportedPlatform;
	cores: number;
}): number {
	switch (platform) {
		case "android": {
			const interceptWorkers = Math.max(
				MIN_ANDROID_INTERCEPT_WORKERS,
				cores - CORES_WITHOUT_ANDROID_INTERCEPT_WORKER,
			);
			return interceptWorkers - INTERCEPT_WORKERS_KEPT_FOR_BYTE_DELIVERY;
		}
		case "ios":
		case "linux":
		case "macos":
		case "windows":
			return Number.POSITIVE_INFINITY;
	}
}

export class LoadSlots {
	#free: number;
	#waiting = new Set<() => void>();

	constructor(capacity: number) {
		this.#free = capacity;
	}

	acquire(grant: () => void): () => void {
		let status: "queued" | "holding" | "released" = "queued";
		const take = () => {
			status = "holding";
			this.#free--;
			grant();
		};

		if (this.#free > 0) take();
		else this.#waiting.add(take);

		return () => {
			const previous = status;
			status = "released";
			if (previous === "queued") this.#waiting.delete(take);
			if (previous === "holding") this.#handOver();
		};
	}

	#handOver() {
		this.#free++;
		const [next] = this.#waiting;
		if (next === undefined) return;
		this.#waiting.delete(next);
		next();
	}
}

let mediaLoadSlots: LoadSlots | undefined;

export function acquireMediaLoadSlot(grant: () => void): () => void {
	mediaLoadSlots ??= new LoadSlots(
		mediaLoadCapacity({
			platform: currentPlatform(),
			cores: navigator.hardwareConcurrency,
		}),
	);
	return mediaLoadSlots.acquire(grant);
}

export function releaseWhenSettled({
	image,
	release,
}: {
	image: HTMLImageElement;
	release: () => void;
}): void {
	const settle = () => {
		clearTimeout(timeout);
		release();
	};
	const timeout = setTimeout(settle, DETACHED_LOAD_TIMEOUT_MS);
	image.addEventListener("load", settle, { once: true });
	image.addEventListener("error", settle, { once: true });
}
