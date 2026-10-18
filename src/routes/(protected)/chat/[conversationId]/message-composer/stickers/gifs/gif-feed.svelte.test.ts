import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest";

import type { GiphyPage, GiphyTile } from "$lib/api/messaging/gifs";

const api = vi.hoisted(() => ({
	getTrendingGifs:
		vi.fn<(params: { offset: number }) => Promise<GiphyPage>>(),
	searchGifs:
		vi.fn<
			(params: { query: string; offset: number }) => Promise<GiphyPage>
		>(),
}));

const link = vi.hoisted(() => ({
	getGifById: vi.fn<(id: string) => Promise<GiphyTile | null>>(),
}));

vi.mock("$lib/api/messaging/gifs", () => api);
vi.mock("$lib/api/messaging/giphy-link", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/giphy-link")>()),
	getGifById: link.getGifById,
}));

import { GifFeed, SEARCH_DEBOUNCE_MS } from "./gif-feed.svelte";
import { gifTile } from "./gif-test-helpers";

function page(ids: string[], nextOffset: number | null = null): GiphyPage {
	return { gifs: ids.map((id) => gifTile(id)), nextOffset };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const ids = (feed: GifFeed) => feed.gifs.map((tile) => tile.id);

let onRestart: Mock<() => void>;
let feed: GifFeed;

async function startedFeed(trending = page(["t1", "t2"], 50)) {
	api.getTrendingGifs.mockResolvedValueOnce(trending);
	feed.start();
	await vi.advanceTimersByTimeAsync(0);
	api.getTrendingGifs.mockClear();
	onRestart.mockClear();
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(console, "error").mockImplementation(() => {});
	api.getTrendingGifs.mockReset();
	api.searchGifs.mockReset();
	link.getGifById.mockReset();
	onRestart = vi.fn<() => void>();
	feed = new GifFeed({ onRestart });
});

afterEach(() => {
	feed.destroy();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("GifFeed", () => {
	it("asks GIPHY for nothing until it is started", async () => {
		feed.setInput("cats");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);

		expect(api.getTrendingGifs).not.toHaveBeenCalled();
		expect(api.searchGifs).not.toHaveBeenCalled();
		expect(feed.empty).toBe(false);
	});

	it("starts with trending when the box is empty", async () => {
		api.getTrendingGifs.mockResolvedValue(page(["t1", "t2"], 50));

		feed.start();
		expect(feed.loading).toBe(true);
		await vi.advanceTimersByTimeAsync(0);

		expect(api.getTrendingGifs).toHaveBeenCalledExactlyOnceWith({
			offset: 0,
		});
		expect(api.searchGifs).not.toHaveBeenCalled();
		expect(feed.loading).toBe(false);
		expect(ids(feed)).toEqual(["t1", "t2"]);
		expect(feed.nextOffset).toBe(50);
	});

	it("starts with a search when text was typed before consent", async () => {
		api.searchGifs.mockResolvedValue(page(["s1"]));
		feed.setInput("  cats ");

		feed.start();
		await vi.advanceTimersByTimeAsync(0);

		expect(api.searchGifs).toHaveBeenCalledExactlyOnceWith({
			query: "cats",
			offset: 0,
		});
		expect(api.getTrendingGifs).not.toHaveBeenCalled();
	});

	it("shows loading at once on input and searches after the debounce", async () => {
		await startedFeed();
		api.searchGifs.mockResolvedValue(page(["s1"]));

		feed.setInput("cat");

		expect(feed.loading).toBe(true);
		expect(feed.gifs).toEqual([]);
		expect(onRestart).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
		expect(api.searchGifs).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(api.searchGifs).toHaveBeenCalledExactlyOnceWith({
			query: "cat",
			offset: 0,
		});
		expect(feed.loading).toBe(false);
		expect(ids(feed)).toEqual(["s1"]);
	});

	it("restarts the debounce on every keystroke", async () => {
		await startedFeed();
		api.searchGifs.mockResolvedValue(page(["s1"]));

		feed.setInput("c");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 100);
		feed.setInput("ca");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 100);
		expect(api.searchGifs).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(100);
		expect(api.searchGifs).toHaveBeenCalledExactlyOnceWith({
			query: "ca",
			offset: 0,
		});
		expect(onRestart).toHaveBeenCalledTimes(2);
	});

	it("searches at once when flushed, without a second request later", async () => {
		await startedFeed();
		api.searchGifs.mockResolvedValue(page(["s1"]));

		feed.setInput("cat");
		feed.flush();
		await vi.advanceTimersByTimeAsync(0);
		expect(api.searchGifs).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
		expect(api.searchGifs).toHaveBeenCalledOnce();
	});

	it("ignores a flush with nothing pending", async () => {
		await startedFeed();

		feed.flush();
		await vi.advanceTimersByTimeAsync(0);

		expect(api.getTrendingGifs).not.toHaveBeenCalled();
		expect(api.searchGifs).not.toHaveBeenCalled();
	});

	it("switches back to trending at once when cleared or whitespace-only", async () => {
		await startedFeed();
		api.searchGifs.mockResolvedValue(page(["s1"]));
		api.getTrendingGifs.mockResolvedValue(page(["t1"]));
		feed.setInput("cat");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

		feed.setInput("   ");

		expect(feed.loading).toBe(true);
		expect(api.getTrendingGifs).toHaveBeenCalledExactlyOnceWith({
			offset: 0,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(ids(feed)).toEqual(["t1"]);
	});

	it("leaves results alone when only surrounding whitespace changes", async () => {
		await startedFeed();
		api.searchGifs.mockResolvedValue(page(["s1"]));
		feed.setInput("cat");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		onRestart.mockClear();

		feed.setInput("cat ");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

		expect(feed.input).toBe("cat ");
		expect(api.searchGifs).toHaveBeenCalledOnce();
		expect(onRestart).not.toHaveBeenCalled();
		expect(ids(feed)).toEqual(["s1"]);
	});

	it("drops a response that arrives after the query moved on", async () => {
		const lateTrending = deferred<GiphyPage>();
		api.getTrendingGifs.mockReturnValue(lateTrending.promise);
		api.searchGifs.mockResolvedValue(page(["s1"]));
		feed.start();

		feed.setInput("cat");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		lateTrending.resolve(page(["t1"], 50));
		await vi.advanceTimersByTimeAsync(0);

		expect(ids(feed)).toEqual(["s1"]);
		expect(feed.nextOffset).toBeNull();
	});

	it("drops a stale failure instead of showing it", async () => {
		const lateSearch = deferred<GiphyPage>();
		await startedFeed();
		api.searchGifs.mockReturnValueOnce(lateSearch.promise);
		api.getTrendingGifs.mockResolvedValue(page(["t1"]));

		feed.setInput("cat");
		feed.flush();
		feed.setInput("");
		lateSearch.reject(new Error("timeout"));
		await vi.advanceTimersByTimeAsync(0);

		expect(feed.error).toBeNull();
		expect(ids(feed)).toEqual(["t1"]);
	});

	it("appends later pages, skipping GIFs it already shows", async () => {
		await startedFeed(page(["t1", "t2"], 50));
		api.getTrendingGifs.mockResolvedValueOnce(
			page(["t2", "t3", "t3"], 100),
		);

		await feed.paging.run();

		expect(api.getTrendingGifs).toHaveBeenCalledExactlyOnceWith({
			offset: 50,
		});
		expect(ids(feed)).toEqual(["t1", "t2", "t3"]);
		expect(feed.nextOffset).toBe(100);
	});

	it("pages through the search that is on screen", async () => {
		await startedFeed();
		api.searchGifs
			.mockResolvedValueOnce(page(["s1"], 50))
			.mockResolvedValueOnce(page(["s2"]));
		feed.setInput("cat");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

		await feed.paging.run();

		expect(api.searchGifs).toHaveBeenLastCalledWith({
			query: "cat",
			offset: 50,
		});
		expect(ids(feed)).toEqual(["s1", "s2"]);
	});

	it("stops paging once GIPHY has no next offset", async () => {
		await startedFeed(page(["t1"], null));

		await feed.paging.run();

		expect(api.getTrendingGifs).not.toHaveBeenCalled();
	});

	it("does not page while the first page is still loading", async () => {
		api.getTrendingGifs.mockReturnValue(new Promise(() => {}));
		feed.start();

		await feed.paging.run();

		expect(api.getTrendingGifs).toHaveBeenCalledOnce();
	});

	it("keeps a late next page out of a new search", async () => {
		const lateNext = deferred<GiphyPage>();
		await startedFeed(page(["t1"], 50));
		api.getTrendingGifs.mockReturnValueOnce(lateNext.promise);
		api.searchGifs.mockResolvedValue(page(["s1"]));

		const paging = feed.paging.run();
		feed.setInput("cat");
		feed.flush();
		await vi.advanceTimersByTimeAsync(0);
		lateNext.resolve(page(["t2"]));
		await paging;

		expect(ids(feed)).toEqual(["s1"]);
	});

	it("keeps the shown GIFs when a next page fails and retries the same offset", async () => {
		await startedFeed(page(["t1", "t2"], 50));
		api.getTrendingGifs
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(page(["t3"], 100));

		await feed.paging.run();

		expect(feed.paging.failure?.message).toBe("offline");
		expect(ids(feed)).toEqual(["t1", "t2"]);
		expect(feed.nextOffset).toBe(50);

		feed.paging.retry();
		await vi.advanceTimersByTimeAsync(0);

		expect(api.getTrendingGifs.mock.calls).toEqual([
			[{ offset: 50 }],
			[{ offset: 50 }],
		]);
		expect(feed.paging.failure).toBeNull();
		expect(ids(feed)).toEqual(["t1", "t2", "t3"]);
		expect(feed.nextOffset).toBe(100);
	});

	it("drops a next-page failure that arrives after the query moved on", async () => {
		const lateNext = deferred<GiphyPage>();
		await startedFeed(page(["t1"], 50));
		api.getTrendingGifs.mockReturnValueOnce(lateNext.promise);
		api.searchGifs
			.mockResolvedValueOnce(page(["s1"], 50))
			.mockResolvedValueOnce(page(["s2"]));
		const stalePaging = feed.paging;
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});

		const paging = stalePaging.run();
		feed.setInput("cat");
		feed.flush();
		await vi.advanceTimersByTimeAsync(0);
		lateNext.reject(new Error("timeout"));
		await paging;

		expect(api.getTrendingGifs).toHaveBeenCalledExactlyOnceWith({
			offset: 50,
		});
		expect(stalePaging.failure).toBeNull();
		expect(feed.paging.failure).toBeNull();
		expect(logged).not.toHaveBeenCalled();
		expect(ids(feed)).toEqual(["s1"]);

		await feed.paging.run();

		expect(api.searchGifs).toHaveBeenLastCalledWith({
			query: "cat",
			offset: 50,
		});
		expect(ids(feed)).toEqual(["s1", "s2"]);
	});

	it("reports a first-page failure and recovers on retry", async () => {
		api.getTrendingGifs
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(page(["t1"]));

		feed.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(feed.loading).toBe(false);
		expect(feed.error?.message).toBe("offline");
		expect(feed.empty).toBe(false);

		feed.retry();
		expect(feed.error).toBeNull();
		expect(feed.loading).toBe(true);
		await vi.advanceTimersByTimeAsync(0);

		expect(ids(feed)).toEqual(["t1"]);
		expect(feed.error).toBeNull();
	});

	it("reports an empty result as empty", async () => {
		await startedFeed();
		api.searchGifs.mockResolvedValue(page([]));

		feed.setInput("zzzz");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

		expect(feed.empty).toBe(true);
		expect(feed.nextOffset).toBeNull();
	});

	it("cuts the query to GIPHY's 50 characters", async () => {
		await startedFeed();
		api.searchGifs.mockResolvedValue(page([]));

		feed.setInput(`${"a".repeat(49)} trailing`);
		feed.flush();

		expect(api.searchGifs).toHaveBeenCalledWith({
			query: "a".repeat(49),
			offset: 0,
		});
	});

	it("never cuts an emoji in half at the 50-character limit", async () => {
		await startedFeed();
		api.searchGifs.mockResolvedValue(page([]));

		feed.setInput(`${"a".repeat(49)}🏳️‍🌈`);
		feed.flush();

		expect(api.searchGifs).toHaveBeenCalledWith({
			query: `${"a".repeat(49)}🏳`,
			offset: 0,
		});
		expect(() =>
			encodeURIComponent(api.searchGifs.mock.calls[0]![0].query),
		).not.toThrow();
	});

	it("waits out the debounce before looking up a typed GIPHY link", async () => {
		await startedFeed();
		link.getGifById.mockResolvedValue(gifTile("xT0xeChUR33EsYNNRK"));

		feed.setInput("https://giphy.com/gifs/x");
		feed.setInput("https://giphy.com/gifs/xT");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
		expect(link.getGifById).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);

		expect(link.getGifById).toHaveBeenCalledExactlyOnceWith("xT");
	});

	it("shows a flushed GIPHY link at once as its only GIF, uncut", async () => {
		await startedFeed();
		link.getGifById.mockResolvedValue(gifTile("xT0xeChUR33EsYNNRK"));

		feed.setInput(
			"https://giphy.com/gifs/portlandia-season-2-episode-xT0xeChUR33EsYNNRK",
		);
		feed.flush();
		await vi.advanceTimersByTimeAsync(0);

		expect(link.getGifById).toHaveBeenCalledExactlyOnceWith(
			"xT0xeChUR33EsYNNRK",
		);
		expect(api.searchGifs).not.toHaveBeenCalled();
		expect(ids(feed)).toEqual(["xT0xeChUR33EsYNNRK"]);
		expect(feed.nextOffset).toBeNull();
	});

	it("searches long text whose cut-off start looks like a GIPHY link as text", async () => {
		await startedFeed();
		api.searchGifs.mockResolvedValue(page([]));
		const cutOff = `giphy.com/gifs/${"x".repeat(35)}`;

		feed.setInput(`${cutOff}xxxxx and more`);
		feed.flush();
		await vi.advanceTimersByTimeAsync(0);

		expect(link.getGifById).not.toHaveBeenCalled();
		expect(api.searchGifs).toHaveBeenCalledExactlyOnceWith({
			query: cutOff,
			offset: 0,
		});
	});

	it("switches between the linked GIF and a text search as words after a link come and go", async () => {
		await startedFeed();
		link.getGifById.mockResolvedValue(gifTile("xT0xeChUR33EsYNNRK"));
		api.searchGifs.mockResolvedValue(page([]));
		const fiftyCharacterLink =
			"https://giphy.com/gifs/funnycat-xT0xeChUR33EsYNNRK";

		for (const input of [
			`${fiftyCharacterLink} lol`,
			fiftyCharacterLink,
			`${fiftyCharacterLink} lol`,
		]) {
			feed.setInput(input);
			feed.flush();
			await vi.advanceTimersByTimeAsync(0);
		}

		expect(api.searchGifs).toHaveBeenCalledTimes(2);
		expect(link.getGifById).toHaveBeenCalledExactlyOnceWith(
			"xT0xeChUR33EsYNNRK",
		);
	});

	it("shows a link to a GIF GIPHY doesn't know as empty", async () => {
		await startedFeed();
		link.getGifById.mockResolvedValue(null);

		feed.setInput("https://giphy.com/gifs/NoSuchDemoGif");
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

		expect(feed.empty).toBe(true);
	});
});
