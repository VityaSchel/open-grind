import { now } from "$lib/util/clock";

const READ_DEBOUNCE_MS = 500;
const READ_MAX_WAIT_MS = 2000;

export class ReadReceiptQueue {
	#entries: { messageId: string; timestamp: number }[] = [];
	#timer: ReturnType<typeof setTimeout> | null = null;
	#deadline: number | null = null;
	#markRead: (messageId: string) => Promise<void>;

	constructor({
		markRead,
	}: {
		markRead: (messageId: string) => Promise<void>;
	}) {
		this.#markRead = markRead;
	}

	push({
		messageId,
		timestamp,
	}: {
		messageId: string;
		timestamp: number;
	}): void {
		this.#entries.push({ messageId, timestamp });
		const current = now();
		this.#deadline ??= current + READ_MAX_WAIT_MS;
		if (this.#timer !== null) clearTimeout(this.#timer);
		const delay = Math.max(
			0,
			Math.min(READ_DEBOUNCE_MS, this.#deadline - current),
		);
		this.#timer = setTimeout(() => {
			void this.flush();
		}, delay);
	}

	async flush(): Promise<void> {
		const entries = this.#entries;
		this.#entries = [];
		this.#timer = null;
		this.#deadline = null;
		entries.sort((a, b) => a.timestamp - b.timestamp);
		const highest = entries.at(-1);
		if (!highest) return;
		await this.#markRead(highest.messageId);
	}

	destroy(): void {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		if (this.#entries.length > 0) void this.flush();
	}
}
