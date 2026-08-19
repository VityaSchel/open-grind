import { ApiError } from "$lib/api/api-error";

const RETRY_DELAYS_MS = [2_000, 6_000, 18_000];

export class InboxPaging {
	running = $state(false);
	failure: Error | null = $state(null);
	#armNonce = $state(0);
	#loadPage: (page: number) => Promise<void>;
	#cursor: () => number | null;
	#consecutiveFailures = 0;
	#demandWhileRunning = false;
	#retryTimer: ReturnType<typeof setTimeout> | null = null;
	#destroyed = false;

	constructor({
		loadPage,
		cursor,
	}: {
		loadPage: (page: number) => Promise<void>;
		cursor: () => number | null;
	}) {
		this.#loadPage = loadPage;
		this.#cursor = cursor;
	}

	get armToken(): string {
		return `${this.#cursor()}:${this.#armNonce}`;
	}

	async run(): Promise<void> {
		if (this.failure !== null) return;
		const page = this.#cursor();
		if (page === null) return;
		if (this.running) {
			this.#demandWhileRunning = true;
			return;
		}
		this.running = true;
		this.#cancelRetry();
		let succeeded = true;
		try {
			await this.#loadPage(page);
			this.#consecutiveFailures = 0;
		} catch (error) {
			succeeded = false;
			console.error(error);
			this.failure =
				error instanceof Error ? error : new Error(String(error));
			this.#consecutiveFailures += 1;
			this.#scheduleRetry();
		} finally {
			this.running = false;
			const deferredDemand = this.#demandWhileRunning;
			this.#demandWhileRunning = false;
			if (deferredDemand && succeeded) this.#armNonce += 1;
		}
	}

	retry(): void {
		this.#cancelRetry();
		this.failure = null;
		this.#consecutiveFailures = 0;
		void this.run();
	}

	rearm(): void {
		this.#cancelRetry();
		this.failure = null;
		this.#consecutiveFailures = 0;
		this.#armNonce += 1;
	}

	destroy(): void {
		this.#destroyed = true;
		this.#cancelRetry();
	}

	#scheduleRetry(): void {
		if (this.#destroyed) return;
		if (!(this.failure instanceof ApiError) || !this.failure.retryable)
			return;
		const delay = RETRY_DELAYS_MS[this.#consecutiveFailures - 1];
		if (delay === undefined) return;
		this.#retryTimer = setTimeout(() => {
			this.#retryTimer = null;
			this.failure = null;
			this.#armNonce += 1;
		}, delay);
	}

	#cancelRetry(): void {
		if (this.#retryTimer === null) return;
		clearTimeout(this.#retryTimer);
		this.#retryTimer = null;
	}
}
