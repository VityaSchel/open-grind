import { afterNavigate, type AfterNavigate } from "$app/navigation";
import { SvelteMap } from "svelte/reactivity";
import z from "zod";

import { liveHistoryIndex } from "#lib/util/history-index.ts";
import { entryPathname } from "#lib/util/pathname.ts";

export const HISTORY_LOG_KEY = "open-grind:history-log";

const savedLogSchema = z.object({
	current: z.number().nullable(),
	entries: z.array(z.tuple([z.number(), z.string()])),
});

type SavedLog = z.infer<typeof savedLogSchema>;

export class HistoryLog {
	readonly #entries = new SvelteMap<number, string>();
	#current: number | null = null;
	#recorded = $state(0);

	constructor() {
		const saved = this.#load();
		if (!saved) return;
		for (const [index, pathname] of saved.entries)
			this.#entries.set(index, pathname);
		this.#current = saved.current;
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
		if (!traverses && previous !== null && index !== previous)
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

	span(index: number): number {
		let span = 1;
		while (this.#entries.has(index - span)) span++;
		return span;
	}

	#load(): SavedLog | undefined {
		try {
			const saved = sessionStorage.getItem(HISTORY_LOG_KEY);
			if (saved === null) return undefined;
			return savedLogSchema.safeParse(JSON.parse(saved)).data;
		} catch {
			return undefined;
		}
	}

	#save(): void {
		const saved: SavedLog = {
			current: this.#current,
			entries: [...this.#entries],
		};
		try {
			sessionStorage.setItem(HISTORY_LOG_KEY, JSON.stringify(saved));
		} catch {
			return;
		}
	}
}

export const historyLog = new HistoryLog();

export function recordHistory(): void {
	afterNavigate(({ type }) => {
		const index = liveHistoryIndex();
		if (index === undefined) return;
		historyLog.record({
			index,
			pathname: entryPathname(location.href),
			type,
			length: history.length,
		});
	});
}
