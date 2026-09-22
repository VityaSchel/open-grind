import { afterEach, describe, expect, it, vi } from "vitest";
import type { NavigationType } from "@sveltejs/kit";

import {
	canGoBack,
	earlierPathnames,
	navigationPending,
	traverseBackTo,
} from "$lib/util/history";

const { navigating, page } = vi.hoisted(() => ({
	navigating: {
		type: null as NavigationType | null,
		to: null as { url: URL } | null,
	},
	page: { url: new URL("https://app.test/") },
}));

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

	it("falls back to the history depth", () => {
		vi.stubGlobal("navigation", undefined);
		vi.stubGlobal("history", { length: 2 });

		expect(canGoBack()).toBe(true);
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
