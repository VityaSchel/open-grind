import { flushSync } from "svelte";

const FRAME_BUDGET_MS = 4;

const OFFSCREEN = 0;
const NEAR_VIEW = 1;
const IN_VIEW = 2;

export type MountTicket = {
	promote: (options?: { inView?: boolean }) => void;
	cancel: () => void;
};

type MountTask = { node: Node; mount: () => void; rank: number };

type MountQueueOptions = {
	requestFrame?: (callback: () => void) => number;
	cancelFrame?: (handle: number) => void;
	now?: () => number;
	flush?: () => void;
	budgetMs?: number;
};

function precedes({ task, other }: { task: MountTask; other: MountTask }) {
	if (task.rank !== other.rank) return task.rank > other.rank;
	return (
		(task.node.compareDocumentPosition(other.node) &
			Node.DOCUMENT_POSITION_FOLLOWING) !==
		0
	);
}

export class MountQueue {
	#tasks = new Set<MountTask>();
	#frame: number | null = null;
	#requestFrame: (callback: () => void) => number;
	#cancelFrame: (handle: number) => void;
	#now: () => number;
	#flush: () => void;
	#budgetMs: number;

	constructor({
		requestFrame = (callback) => requestAnimationFrame(callback),
		cancelFrame = (handle) => cancelAnimationFrame(handle),
		now = () => performance.now(),
		flush = () => flushSync(),
		budgetMs = FRAME_BUDGET_MS,
	}: MountQueueOptions = {}) {
		this.#requestFrame = requestFrame;
		this.#cancelFrame = cancelFrame;
		this.#now = now;
		this.#flush = flush;
		this.#budgetMs = budgetMs;
	}

	add({ node, mount }: { node: Node; mount: () => void }): MountTicket {
		const task: MountTask = { node, mount, rank: OFFSCREEN };
		this.#tasks.add(task);
		this.#schedule();
		return {
			promote: ({ inView = false } = {}) => {
				if (!this.#tasks.has(task)) return;
				task.rank = Math.max(task.rank, inView ? IN_VIEW : NEAR_VIEW);
				this.#schedule();
			},
			cancel: () => {
				this.#tasks.delete(task);
			},
		};
	}

	destroy() {
		this.#tasks.clear();
		if (this.#frame !== null) this.#cancelFrame(this.#frame);
		this.#frame = null;
	}

	#schedule() {
		this.#frame ??= this.#requestFrame(() => this.#drain());
	}

	#drain() {
		this.#frame = null;
		const start = this.#now();
		const ordered = [...this.#tasks]
			.filter((task) => task.node.isConnected)
			.sort((task, other) => (precedes({ task, other }) ? -1 : 1));
		try {
			for (const task of ordered) {
				if (!this.#tasks.delete(task)) continue;
				task.mount();
				this.#flush();
				if (this.#now() - start >= this.#budgetMs) break;
			}
		} finally {
			if ([...this.#tasks].some((task) => task.node.isConnected)) {
				this.#schedule();
			}
		}
	}
}
