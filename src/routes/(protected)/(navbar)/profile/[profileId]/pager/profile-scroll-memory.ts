import { liveHistoryIndex } from "#lib/util/history-index.ts";

export type RememberedScroll = { profileId: number; scrollTop: number };

const rememberedByEntry = new Map<number, RememberedScroll>();

export class ProfileScrollMemory {
	readonly #remembered: Map<number, RememberedScroll>;
	readonly #historyIndex: () => number | undefined;
	#entry: number | undefined;
	#restoring = false;

	constructor({
		remembered = rememberedByEntry,
		historyIndex = liveHistoryIndex,
	}: {
		remembered?: Map<number, RememberedScroll>;
		historyIndex?: () => number | undefined;
	} = {}) {
		this.#remembered = remembered;
		this.#historyIndex = historyIndex;
	}

	enter({ traversal }: { traversal: boolean }): void {
		const entry = this.#historyIndex();
		this.#entry = entry;
		this.#restoring = traversal;
		if (traversal || entry === undefined) return;
		for (const remembered of [...this.#remembered.keys()])
			if (remembered >= entry) this.#remembered.delete(remembered);
	}

	remember({
		profileId,
		scrollTop,
	}: {
		profileId: number;
		scrollTop: number;
	}): void {
		if (this.#entry === undefined) return;
		this.#remembered.set(this.#entry, { profileId, scrollTop });
	}

	restore({
		profileId,
		scroller,
	}: {
		profileId: number;
		scroller: HTMLElement | null;
	}): void {
		if (!this.#restoring) return;
		this.#restoring = false;
		const remembered =
			this.#entry === undefined
				? undefined
				: this.#remembered.get(this.#entry);
		if (scroller && remembered?.profileId === profileId)
			scroller.scrollTop = remembered.scrollTop;
	}
}
