import { afterNavigate, type AfterNavigate } from "$app/navigation";
import { SvelteMap } from "svelte/reactivity";
import z from "zod";

import { liveHistoryIndex } from "#lib/util/history-index.ts";

const STORAGE_KEY = "open-grind:history-log";

const savedLogSchema = z.object({
	current: z.number().nullable(),
	entries: z.array(z.tuple([z.number(), z.string()])),
});

type SavedLog = z.infer<typeof savedLogSchema>;

export class HistoryLog {
	readonly #entries = new SvelteMap<number, string>();
	#current: number | undefined;
	#recorded = $state(0);
	readonly #storage: () => Storage;

	constructor({ storage }: { storage: () => Storage }) {
		this.#storage = storage;
		const saved = this.#load();
		if (!saved) return;
		for (const [index, pathname] of saved.entries)
			this.#entries.set(index, pathname);
		this.#current = saved.current ?? undefined;
	}

	record({
		index,
		pathname,
		type,
		length,
	}: {
		index: number;
		pathname: string;
		type: AfterNavigate["type"];
		length: number;
	}): void {
		const entries = this.#entries;
		const traverses =
			type === "popstate" || (type === "enter" && entries.has(index));
		const previous = this.#current;
		if (!traverses && previous !== undefined && index !== previous)
			for (const key of [...entries.keys()])
				if (key > previous) entries.delete(key);
		entries.set(index, pathname);

		const evicted = [...entries.keys()]
			.sort((a, b) => a - b)
			.slice(0, Math.max(entries.size - length, 0));
		for (const key of evicted) entries.delete(key);

		this.#current = index;
		this.#recorded += 1;
		this.#save();
	}

	get recorded(): number {
		return this.#recorded;
	}

	earlier({
		index,
		limit,
	}: {
		index: number;
		limit: number;
	}): (string | null)[] {
		const oldest = Math.min(...this.#entries.keys());
		const count = Math.max(Math.min(limit, index - oldest), 0);
		return Array.from(
			{ length: count },
			(_, step) => this.#entries.get(index - step - 1) ?? null,
		);
	}

	hasEntryBefore(index: number): boolean {
		return [...this.#entries.keys()].some((key) => key < index);
	}

	span(index: number): number {
		let span = 1;
		while (this.#entries.has(index - span)) span++;
		return span;
	}

	#load(): SavedLog | undefined {
		try {
			const saved = this.#storage().getItem(STORAGE_KEY);
			if (saved === null) return undefined;
			return savedLogSchema.safeParse(JSON.parse(saved)).data;
		} catch {
			return undefined;
		}
	}

	#save(): void {
		const saved: SavedLog = {
			current: this.#current ?? null,
			entries: [...this.#entries],
		};
		try {
			this.#storage().setItem(STORAGE_KEY, JSON.stringify(saved));
		} catch {
			return;
		}
	}
}

export const historyLog = new HistoryLog({ storage: () => sessionStorage });

export function recordHistory(): void {
	afterNavigate((navigation) => {
		try {
			const index = liveHistoryIndex();
			if (index === undefined) return;
			historyLog.record({
				index,
				pathname: location.pathname,
				type: navigation.type,
				length: history.length,
			});
		} catch (error) {
			console.error("Failed to record the history entry", error);
		}
	});
}
