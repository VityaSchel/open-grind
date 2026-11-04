import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AfterNavigate } from "$app/navigation";

import { HISTORY_METADATA_KEY } from "#lib/util/history-index.ts";
import { HistoryLog } from "#lib/util/history-log.svelte.ts";

const { afterNavigate } = vi.hoisted(() => ({
	afterNavigate:
		vi.fn<(callback: (navigation: AfterNavigate) => void) => void>(),
}));

vi.mock("$app/navigation", () => ({ afterNavigate }));

type Step = {
	index: number;
	pathname: string;
	type?: AfterNavigate["type"];
	length?: number;
};

function memoryStorage(): Storage {
	const items = new Map<string, string>();
	return {
		get length() {
			return items.size;
		},
		clear: () => items.clear(),
		getItem: (key) => items.get(key) ?? null,
		key: (position) => [...items.keys()][position] ?? null,
		removeItem: (key) => void items.delete(key),
		setItem: (key, value) => void items.set(key, value),
	};
}

function walk(steps: Step[], storage = memoryStorage()) {
	const log = new HistoryLog({ storage: () => storage });
	for (const { index, pathname, type = "link", length = 100 } of steps)
		log.record({ index, pathname, type, length });
	return { log, storage };
}

const LAUNCH = 1_762_200_000_000;

describe("HistoryLog", () => {
	it("lists the screens behind an entry, nearest first", () => {
		const { log } = walk([
			{ index: LAUNCH, pathname: "/", type: "enter" },
			{ index: LAUNCH + 1, pathname: "/settings" },
			{ index: LAUNCH + 2, pathname: "/settings/app" },
		]);

		expect(log.earlier({ index: LAUNCH + 2, limit: 10 })).toEqual([
			"/settings",
			"/",
		]);
		expect(log.hasEntryBefore(LAUNCH + 2)).toBe(true);
		expect(log.hasEntryBefore(LAUNCH)).toBe(false);
	});

	it("takes the place of an entry that a navigation replaced", () => {
		const { log } = walk([
			{ index: LAUNCH, pathname: "/", type: "enter" },
			{ index: LAUNCH + 1, pathname: "/interest/taps" },
			{ index: LAUNCH + 1, pathname: "/interest/views", type: "goto" },
			{ index: LAUNCH + 2, pathname: "/settings" },
		]);

		expect(log.earlier({ index: LAUNCH + 2, limit: 10 })).toEqual([
			"/interest/views",
			"/",
		]);
	});

	it("keeps the entries ahead of a traversal and drops them on the next push", () => {
		const { log } = walk([
			{ index: LAUNCH, pathname: "/", type: "enter" },
			{ index: LAUNCH + 1, pathname: "/settings" },
			{ index: LAUNCH + 2, pathname: "/settings/app" },
			{ index: LAUNCH + 3, pathname: "/settings/app/credits" },
			{ index: LAUNCH + 1, pathname: "/settings", type: "popstate" },
		]);

		expect(log.span(LAUNCH + 4)).toBe(5);

		log.record({
			index: LAUNCH + 2,
			pathname: "/settings/account",
			type: "link",
			length: 3,
		});

		expect(log.span(LAUNCH + 4)).toBe(1);
		expect(log.earlier({ index: LAUNCH + 3, limit: 10 })).toEqual([
			"/settings/account",
			"/settings",
			"/",
		]);
	});

	it("keeps every entry across a reload onto a known one", () => {
		const { log } = walk([
			{ index: LAUNCH, pathname: "/", type: "enter" },
			{ index: LAUNCH + 1, pathname: "/settings" },
			{ index: LAUNCH + 2, pathname: "/settings/app" },
			{ index: LAUNCH + 1, pathname: "/settings", type: "popstate" },
			{ index: LAUNCH + 1, pathname: "/settings", type: "enter" },
		]);

		expect(log.span(LAUNCH + 3)).toBe(4);
	});

	it("drops the old entries ahead when a new document pushes past them", () => {
		const { log } = walk([
			{ index: LAUNCH, pathname: "/", type: "enter" },
			{ index: LAUNCH + 1, pathname: "/settings" },
			{ index: LAUNCH, pathname: "/", type: "popstate" },
			{ index: LAUNCH + 60_000, pathname: "/chat", type: "enter" },
		]);

		expect(log.earlier({ index: LAUNCH + 2, limit: 10 })).toEqual([
			null,
			"/",
		]);
		expect(log.hasEntryBefore(LAUNCH + 60_000)).toBe(true);
	});

	it("leaves a gap for an index it never saw instead of shortening the trip", () => {
		const { log } = walk([
			{ index: LAUNCH, pathname: "/", type: "enter" },
			{ index: LAUNCH + 2, pathname: "/chat/1:2" },
		]);

		expect(log.earlier({ index: LAUNCH + 3, limit: 10 })).toEqual([
			"/chat/1:2",
			null,
			"/",
		]);
		expect(log.span(LAUNCH + 3)).toBe(2);
	});

	it("never lists more entries than history holds behind this one", () => {
		const { log } = walk([
			{ index: LAUNCH, pathname: "/", type: "enter" },
			{ index: LAUNCH + 1, pathname: "/settings" },
			{ index: LAUNCH + 2, pathname: "/settings/app" },
		]);

		expect(log.earlier({ index: LAUNCH + 2, limit: 1 })).toEqual([
			"/settings",
		]);
		expect(log.earlier({ index: LAUNCH + 2, limit: 0 })).toEqual([]);
	});

	it("forgets the oldest entries once history holds fewer", () => {
		const { log } = walk([
			{ index: LAUNCH, pathname: "/", type: "enter", length: 1 },
			{ index: LAUNCH + 1, pathname: "/settings", length: 2 },
			{ index: LAUNCH + 2, pathname: "/settings/app", length: 2 },
		]);

		expect(log.hasEntryBefore(LAUNCH + 1)).toBe(false);
		expect(log.earlier({ index: LAUNCH + 2, limit: 10 })).toEqual([
			"/settings",
		]);
	});

	it("starts empty", () => {
		const { log } = walk([]);

		expect(log.earlier({ index: LAUNCH, limit: 10 })).toEqual([]);
		expect(log.hasEntryBefore(LAUNCH)).toBe(false);
		expect(log.span(LAUNCH)).toBe(1);
	});

	it("restores what it logged after the page reloads", () => {
		const { storage } = walk([
			{ index: LAUNCH, pathname: "/", type: "enter" },
			{ index: LAUNCH + 1, pathname: "/chat" },
			{ index: LAUNCH + 2, pathname: "/chat/1:2" },
		]);

		const reloaded = new HistoryLog({ storage: () => storage });
		reloaded.record({
			index: LAUNCH + 2,
			pathname: "/chat/1:2",
			type: "enter",
			length: 3,
		});

		expect(reloaded.earlier({ index: LAUNCH + 2, limit: 10 })).toEqual([
			"/chat",
			"/",
		]);
	});

	it("ignores a saved log it cannot read", () => {
		const storage = memoryStorage();
		storage.setItem("open-grind:history-log", "{not json");
		const broken = new HistoryLog({ storage: () => storage });
		storage.setItem(
			"open-grind:history-log",
			JSON.stringify({ current: "x", entries: [[1, 2]] }),
		);
		const mistyped = new HistoryLog({ storage: () => storage });

		expect(broken.span(LAUNCH)).toBe(1);
		expect(mistyped.hasEntryBefore(LAUNCH)).toBe(false);
	});

	it("lets a reader in an effect run again after every recorded navigation", () => {
		const log = new HistoryLog({ storage: memoryStorage });
		const seen: number[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				seen.push(log.recorded);
			});
		});
		flushSync();

		log.record({ index: LAUNCH, pathname: "/", type: "enter", length: 1 });
		flushSync();
		log.record({
			index: LAUNCH,
			pathname: "/chat",
			type: "link",
			length: 1,
		});
		flushSync();

		expect(seen).toEqual([0, 1, 2]);
		stop();
	});

	it("keeps logging in memory when storage is unavailable", () => {
		const log = new HistoryLog({
			storage: () => {
				throw new DOMException("denied", "SecurityError");
			},
		});

		log.record({ index: LAUNCH, pathname: "/", type: "enter", length: 1 });
		log.record({
			index: LAUNCH + 1,
			pathname: "/chat",
			type: "link",
			length: 2,
		});

		expect(log.earlier({ index: LAUNCH + 1, limit: 10 })).toEqual(["/"]);
	});
});

describe("recordHistory", () => {
	beforeEach(() => {
		sessionStorage.clear();
		afterNavigate.mockReset();
	});

	afterEach(() => {
		history.replaceState(null, "", "/");
		vi.restoreAllMocks();
	});

	async function startRecording() {
		vi.resetModules();
		const { historyLog, recordHistory } =
			await import("#lib/util/history-log.svelte.ts");
		recordHistory();
		const [[record]] = afterNavigate.mock.calls as [
			[(navigation: AfterNavigate) => void],
		];
		return { historyLog, record };
	}

	function land({
		record,
		index,
		pathname,
		navigation,
	}: {
		record: (navigation: AfterNavigate) => void;
		index: number;
		pathname: string;
		navigation: Partial<AfterNavigate>;
	}) {
		const state = { [HISTORY_METADATA_KEY]: { historyIndex: index } };
		if (navigation.type === "link") history.pushState(state, "", pathname);
		else history.replaceState(state, "", pathname);
		record(navigation as AfterNavigate);
	}

	it("records the first screen, whose navigation comes from nowhere", async () => {
		const { historyLog, record } = await startRecording();

		expect(() =>
			land({
				record,
				index: LAUNCH,
				pathname: "/settings",
				navigation: { type: "enter", from: { url: null } as never },
			}),
		).not.toThrow();
		land({
			record,
			index: LAUNCH + 1,
			pathname: "/settings/app",
			navigation: { type: "link" },
		});

		expect(historyLog.earlier({ index: LAUNCH + 1, limit: 10 })).toEqual([
			"/settings",
		]);
	});

	it("never throws into the router", async () => {
		const { record } = await startRecording();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("full", "QuotaExceededError");
		});

		expect(() =>
			land({
				record,
				index: LAUNCH,
				pathname: "/",
				navigation: { type: "enter" },
			}),
		).not.toThrow();
		expect(() => record(undefined as never)).not.toThrow();
	});

	it("skips an entry SvelteKit has not numbered", async () => {
		const { historyLog, record } = await startRecording();
		history.replaceState(null, "", "/settings");

		record({ type: "enter" } as AfterNavigate);

		expect(historyLog.span(LAUNCH)).toBe(1);
	});
});
