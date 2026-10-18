import {
	getTrendingGifs,
	type GiphyPage,
	type GiphyTile,
	searchGifs,
} from "$lib/api/messaging/gifs";
import { getGifById, giphyIdFromLink } from "$lib/api/messaging/giphy-link";
import { Generation } from "$lib/util/generation";
import { SentinelPaging } from "$lib/util/sentinel-paging.svelte";

export const SEARCH_DEBOUNCE_MS = 400;
const GIF_SEARCH_MAX_LENGTH = 50;
export const GIF_INPUT_MAX_LENGTH = 500;

type GifQuery = { text: string; linkedId: string | null };

function gifQuery(input: string): GifQuery {
	const trimmed = input.trim();
	const linkedId = giphyIdFromLink(trimmed);
	if (linkedId !== null) return { text: trimmed, linkedId };
	return {
		text: Array.from(input).slice(0, GIF_SEARCH_MAX_LENGTH).join("").trim(),
		linkedId: null,
	};
}

async function fetchGifPage({
	query,
	offset,
}: {
	query: GifQuery;
	offset: number;
}): Promise<GiphyPage> {
	if (query.linkedId !== null) {
		const gif = await getGifById(query.linkedId);
		return { gifs: gif === null ? [] : [gif], nextOffset: null };
	}
	return query.text === ""
		? await getTrendingGifs({ offset })
		: await searchGifs({ query: query.text, offset });
}

function appendUnseen({
	gifs,
	page,
}: {
	gifs: GiphyTile[];
	page: GiphyTile[];
}): GiphyTile[] {
	const shown = new Set(gifs.map((gif) => gif.id));
	const unseen = page.filter(
		(gif, index) =>
			!shown.has(gif.id) &&
			page.findIndex(({ id }) => id === gif.id) === index,
	);
	return [...gifs, ...unseen];
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export class GifFeed {
	input = $state("");
	gifs: GiphyTile[] = $state.raw([]);
	loading = $state(true);
	error: Error | null = $state(null);
	nextOffset: number | null = $state(null);
	#paging: SentinelPaging = $state.raw(this.#createPaging());

	#query: GifQuery = { text: "", linkedId: null };
	#started = false;
	#generation = new Generation();
	#debounceTimer: ReturnType<typeof setTimeout> | null = null;
	#onRestart: () => void;

	constructor({ onRestart }: { onRestart: () => void }) {
		this.#onRestart = onRestart;
	}

	get paging(): SentinelPaging {
		return this.#paging;
	}

	get empty(): boolean {
		return !this.loading && this.error === null && this.gifs.length === 0;
	}

	start(): void {
		if (this.#started) return;
		this.#started = true;
		const generation = this.#restart();
		void this.#loadFirstPage({ query: this.#query, generation });
	}

	setInput(input: string): void {
		this.input = input;
		const query = gifQuery(input);
		if (
			query.text === this.#query.text &&
			query.linkedId === this.#query.linkedId
		)
			return;
		this.#query = query;
		if (!this.#started) return;
		const generation = this.#restart();
		if (query.text === "") {
			void this.#loadFirstPage({ query, generation });
			return;
		}
		this.#debounceTimer = setTimeout(() => {
			this.#debounceTimer = null;
			void this.#loadFirstPage({ query, generation });
		}, SEARCH_DEBOUNCE_MS);
	}

	flush(): void {
		if (this.#debounceTimer === null) return;
		this.#cancelDebounce();
		void this.#loadFirstPage({
			query: this.#query,
			generation: this.#generation.current,
		});
	}

	retry(): void {
		if (!this.#started) return;
		const generation = this.#restart();
		void this.#loadFirstPage({ query: this.#query, generation });
	}

	destroy(): void {
		this.#cancelDebounce();
		this.#generation.next();
		this.#paging.destroy();
	}

	#restart(): number {
		this.#cancelDebounce();
		const generation = this.#generation.next();
		this.#paging.destroy();
		this.#paging = this.#createPaging();
		this.gifs = [];
		this.nextOffset = null;
		this.error = null;
		this.loading = true;
		this.#onRestart();
		return generation;
	}

	#createPaging(): SentinelPaging {
		return new SentinelPaging({
			loadPage: (offset) => this.#loadNextPage(offset),
			cursor: () => this.nextOffset,
		});
	}

	async #loadFirstPage({
		query,
		generation,
	}: {
		query: GifQuery;
		generation: number;
	}): Promise<void> {
		if (this.#generation.isStale(generation)) return;
		try {
			const page = await fetchGifPage({ query, offset: 0 });
			if (this.#generation.isStale(generation)) return;
			this.gifs = appendUnseen({ gifs: [], page: page.gifs });
			this.nextOffset = page.nextOffset;
		} catch (error) {
			if (this.#generation.isStale(generation)) return;
			console.error(error);
			this.error = asError(error);
		}
		this.loading = false;
	}

	async #loadNextPage(offset: number): Promise<void> {
		const generation = this.#generation.current;
		const page = await fetchGifPage({ query: this.#query, offset }).catch(
			(error: unknown) => {
				if (this.#generation.isStale(generation)) return null;
				throw error;
			},
		);
		if (page === null || this.#generation.isStale(generation)) return;
		this.gifs = appendUnseen({ gifs: this.gifs, page: page.gifs });
		this.nextOffset = page.nextOffset;
	}

	#cancelDebounce(): void {
		if (this.#debounceTimer === null) return;
		clearTimeout(this.#debounceTimer);
		this.#debounceTimer = null;
	}
}
