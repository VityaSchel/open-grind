import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigationType } from "$app/navigation";

import { HISTORY_METADATA_KEY } from "#lib/util/history-index.ts";
import {
	canGoBack,
	earlierPathnames,
	goBack,
	navigationPending,
	returnTo,
	traverseBackTo,
} from "#lib/util/history.ts";

const { goto, navigating, page } = vi.hoisted(() => ({
	goto: vi.fn(),
	navigating: {
		type: null as NavigationType | null,
		to: null as { url: URL } | null,
	},
	page: { url: new URL("https://app.test/") },
}));

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/state", () => ({ navigating, page }));

function stubEntries(paths: string[], index: number) {
	const go = vi.fn();
	vi.stubGlobal("navigation", {
		canGoBack: index > 0,
		currentEntry: { index },
		entries: () =>
			paths.map((path) => ({ url: `https://app.test${path}` })),
	});
	vi.stubGlobal("history", { go, length: paths.length });
	return go;
}

afterEach(() => {
	vi.unstubAllGlobals();
	goto.mockClear();
});

describe("traverseBackTo", () => {
	it("walks back to the nearest earlier entry for the path", () => {
		const go = stubEntries(
			["/", "/settings", "/settings/app", "/settings", "/settings/app"],
			4,
		);

		expect(traverseBackTo("/settings")).toBe(true);
		expect(go).toHaveBeenCalledWith(-1);
	});

	it("collapses every entry between here and the target", () => {
		const go = stubEntries(
			[
				"/",
				"/settings",
				"/settings/account",
				"/settings/account/privacy",
			],
			3,
		);

		expect(traverseBackTo("/settings")).toBe(true);
		expect(go).toHaveBeenCalledWith(-2);
	});

	it("never traverses forward", () => {
		const go = stubEntries(["/", "/settings", "/settings/app"], 1);

		expect(traverseBackTo("/settings/app")).toBe(false);
		expect(go).not.toHaveBeenCalled();
	});

	it("reports no match for a path that was never visited", () => {
		const go = stubEntries(["/", "/chat", "/chat/7"], 2);

		expect(traverseBackTo("/settings")).toBe(false);
		expect(go).not.toHaveBeenCalled();
	});

	it("stays put on the first entry", () => {
		const go = stubEntries(["/settings"], 0);

		expect(traverseBackTo("/settings")).toBe(false);
		expect(go).not.toHaveBeenCalled();
	});

	it("leaves the link alone without the Navigation API", () => {
		const go = vi.fn();
		vi.stubGlobal("navigation", undefined);
		vi.stubGlobal("history", { go, length: 3 });

		expect(traverseBackTo("/settings")).toBe(false);
		expect(go).not.toHaveBeenCalled();
	});
});

describe("returnTo", () => {
	it("walks back to the screen when it is behind this one", () => {
		const go = stubEntries(["/", "/chat", "/chat/1:2"], 2);

		returnTo("/chat");

		expect(go).toHaveBeenCalledWith(-1);
		expect(goto).not.toHaveBeenCalled();
	});

	it("walks back to a launch entry whose address has no path for the root", () => {
		const go = vi.fn();
		vi.stubGlobal("navigation", {
			canGoBack: true,
			currentEntry: { index: 1 },
			entries: () => [
				{ url: "tauri://localhost" },
				{ url: "tauri://localhost/profile/7" },
			],
		});
		vi.stubGlobal("history", { go, length: 2 });

		returnTo("/");

		expect(go).toHaveBeenCalledWith(-1);
		expect(goto).not.toHaveBeenCalled();
	});

	it("takes this entry's place when the screen is not behind it", () => {
		const go = stubEntries(["/", "/chat/1:2"], 1);

		returnTo("/chat");

		expect(goto).toHaveBeenCalledWith("/chat", { replace: true });
		expect(go).not.toHaveBeenCalled();
	});
});

describe("goBack", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		navigating.type = null;
	});

	function stubBack(paths: string[], index: number) {
		const go = stubEntries(paths, index);
		const back = vi.fn();
		vi.stubGlobal("history", { go, back, length: paths.length });
		return { go, back };
	}

	it("goes back when there is a screen behind this one", () => {
		const { back } = stubBack(["/chat", "/chat/1:2"], 1);

		goBack({ parent: "/chat" });

		expect(back).toHaveBeenCalledOnce();
		expect(goto).not.toHaveBeenCalled();
	});

	it("takes this entry's place with the parent when nothing is behind it", () => {
		const { back } = stubBack(["/chat/1:2"], 0);

		goBack({ parent: "/chat" });

		expect(back).not.toHaveBeenCalled();
		expect(goto).toHaveBeenCalledExactlyOnceWith("/chat", {
			replace: true,
		});
	});

	it("returns to the parent when the back has not left within a second", () => {
		stubBack(["/", "/chat/1:2"], 1);

		goBack({ parent: "/chat" });
		vi.advanceTimersByTime(999);
		expect(goto).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);

		expect(goto).toHaveBeenCalledExactlyOnceWith("/chat", {
			replace: true,
		});
	});

	it("leaves the back alone once it has started", () => {
		const { go } = stubBack(["/chat", "/chat/1:2"], 1);

		goBack({ parent: "/chat" });
		dispatchEvent(new PopStateEvent("popstate"));
		vi.advanceTimersByTime(1000);

		expect(goto).not.toHaveBeenCalled();
		expect(go).not.toHaveBeenCalled();
	});

	it("leaves another navigation started meanwhile alone", () => {
		stubBack(["/", "/chat/1:2"], 1);

		goBack({ parent: "/chat" });
		navigating.type = "goto";
		vi.advanceTimersByTime(1000);

		expect(goto).not.toHaveBeenCalled();
	});
});

describe("earlierPathnames", () => {
	it("lists the entries behind the current one, nearest first", () => {
		stubEntries(["/", "/chat", "/chat/1:2", "/settings"], 2);

		expect(earlierPathnames()).toEqual(["/chat", "/"]);
	});

	it("keeps an entry with no URL as a null gap", () => {
		vi.stubGlobal("navigation", {
			currentEntry: { index: 2 },
			entries: () => [
				{ url: "https://app.test/" },
				{ url: null },
				{ url: "https://app.test/chat" },
			],
		});

		expect(earlierPathnames()).toEqual([null, "/"]);
	});

	it("is empty on the first entry or without the Navigation API", () => {
		stubEntries(["/chat/1:2"], 0);
		expect(earlierPathnames()).toEqual([]);

		vi.stubGlobal("navigation", undefined);
		expect(earlierPathnames()).toEqual([]);
	});
});

describe("canGoBack", () => {
	it("trusts the Navigation API when it is there", () => {
		stubEntries(["/settings"], 0);

		expect(canGoBack()).toBe(false);
	});

	it("never counts the history depth as a screen behind this one", () => {
		vi.stubGlobal("navigation", undefined);
		vi.stubGlobal("history", { length: 2 });

		expect(canGoBack()).toBe(false);
	});
});

describe("the history log", () => {
	const LAUNCH = 1_762_200_000_000;

	async function loadWithLog(paths: string[]) {
		sessionStorage.clear();
		vi.resetModules();
		const { historyLog } = await import("#lib/util/history-log.svelte.ts");
		for (const [step, pathname] of paths.entries())
			historyLog.record({
				index: LAUNCH + step,
				pathname,
				type: step === 0 ? "enter" : "link",
				length: step + 1,
			});
		return await import("#lib/util/history.ts");
	}

	function standAt({ step, length }: { step: number; length: number }) {
		const go = vi.fn();
		vi.stubGlobal("history", {
			state: { [HISTORY_METADATA_KEY]: { historyIndex: LAUNCH + step } },
			length,
			go,
		});
		return go;
	}

	function navigationWith({
		paths,
		index,
	}: {
		paths: string[];
		index: number;
	}) {
		vi.stubGlobal("navigation", {
			canGoBack: index > 0,
			currentEntry: { index },
			entries: () =>
				paths.map((path) => ({ url: `https://app.test${path}` })),
		});
	}

	it("walks back through the log without the Navigation API", async () => {
		vi.stubGlobal("navigation", undefined);
		const history = await loadWithLog([
			"/",
			"/settings",
			"/settings/account",
			"/settings/account/blocked",
		]);
		const go = standAt({ step: 3, length: 4 });

		expect(history.canGoBack()).toBe(true);
		expect(history.earlierPathnames()).toEqual([
			"/settings/account",
			"/settings",
			"/",
		]);

		history.returnTo("/settings");

		expect(go).toHaveBeenCalledExactlyOnceWith(-2);
		expect(goto).not.toHaveBeenCalled();
	});

	it("has nothing behind the first entry, however deep history is", async () => {
		vi.stubGlobal("navigation", undefined);
		const history = await loadWithLog(["/settings"]);
		standAt({ step: 0, length: 5 });

		expect(history.canGoBack()).toBe(false);
		expect(history.earlierPathnames()).toEqual([]);
	});

	it("takes over from a Navigation API that lost its entries when the page was relaunched", async () => {
		const history = await loadWithLog(["/", "/chat", "/chat/1:2"]);
		navigationWith({ paths: ["/chat/1:2"], index: 0 });
		const go = standAt({ step: 2, length: 3 });

		expect(history.canGoBack()).toBe(true);
		expect(history.earlierPathnames()).toEqual(["/chat", "/"]);
		history.returnTo("/chat");
		expect(go).toHaveBeenCalledExactlyOnceWith(-1);

		navigationWith({ paths: ["/chat/1:2"], index: -1 });
		standAt({ step: 1, length: 3 });

		expect(history.canGoBack()).toBe(true);
		expect(history.earlierPathnames()).toEqual(["/"]);
	});

	it("trusts a Navigation API that holds at least the entries the log knows", async () => {
		const history = await loadWithLog(["/", "/settings", "/settings/app"]);
		navigationWith({ paths: ["/", "/chat", "/chat/1:2"], index: 2 });
		standAt({ step: 2, length: 3 });

		expect(history.earlierPathnames()).toEqual(["/chat", "/"]);
	});
});

describe("navigationPending", () => {
	const TABS = ["/interest/views", "/interest/taps"];
	const ownsTab = (pathname: string) => TABS.includes(pathname);

	function arrange({
		shown,
		located = shown,
		pending,
	}: {
		shown: string;
		located?: string;
		pending?: { type: NavigationType; to: string };
	}) {
		page.url = new URL(shown, page.url);
		window.history.replaceState(null, "", located);
		navigating.type = pending?.type ?? null;
		navigating.to = pending ? { url: new URL(pending.to, page.url) } : null;
	}

	it("is idle when nothing navigates and the location is the page", () => {
		arrange({ shown: "/interest/taps" });

		expect(navigationPending({ owns: ownsTab })).toBe(false);
	});

	it("reports a traversal even onto a path the caller owns", () => {
		arrange({
			shown: "/interest/taps",
			located: "/interest/views",
			pending: { type: "popstate", to: "/interest/views" },
		});

		expect(navigationPending({ owns: ownsTab })).toBe(true);
	});

	it("reports a traversal that moved the location before SvelteKit announced it", () => {
		arrange({ shown: "/interest/taps", located: "/" });

		expect(navigationPending({ owns: ownsTab })).toBe(true);
	});

	it("reports a location moved onto an owned path with no navigation to own it", () => {
		arrange({ shown: "/interest/taps", located: "/interest/views" });

		expect(navigationPending({ owns: ownsTab })).toBe(true);
	});

	it("exempts the caller's own replace before it has written the location", () => {
		arrange({
			shown: "/interest/taps",
			pending: { type: "goto", to: "/interest/views" },
		});

		expect(navigationPending({ owns: ownsTab })).toBe(false);
	});

	it("exempts the caller's own replace once it has written the location", () => {
		arrange({
			shown: "/interest/taps",
			located: "/interest/views",
			pending: { type: "goto", to: "/interest/views" },
		});

		expect(navigationPending({ owns: ownsTab })).toBe(false);
	});

	it("reports someone else's goto in flight", () => {
		arrange({
			shown: "/interest/taps",
			pending: { type: "goto", to: "/chat" },
		});

		expect(navigationPending({ owns: ownsTab })).toBe(true);
	});

	it("reports a traversal that starts while the caller's own replace is pending", () => {
		arrange({
			shown: "/interest/taps",
			located: "/",
			pending: { type: "goto", to: "/interest/views" },
		});

		expect(navigationPending({ owns: ownsTab })).toBe(true);
	});
});
