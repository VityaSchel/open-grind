import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";
import type {
	AfterNavigate,
	BeforeNavigate,
	NavigationType,
} from "@sveltejs/kit";

import { clearAccountCaches } from "$lib/api/account-caches";
import { guardDeletedPages, leaveDeletedPages } from "$lib/util/deleted-pages";

const { afterNavigate, beforeNavigate, earlierPathnames, page, returnTo } =
	vi.hoisted(() => ({
		afterNavigate:
			vi.fn<(callback: (navigation: AfterNavigate) => void) => void>(),
		beforeNavigate:
			vi.fn<(callback: (navigation: BeforeNavigate) => void) => void>(),
		earlierPathnames: vi.fn<() => (string | null)[]>(),
		page: { url: new URL("https://app.test/chat") },
		returnTo: vi.fn(),
	}));

vi.mock("$app/navigation", () => ({ afterNavigate, beforeNavigate }));
vi.mock("$app/state", () => ({ page }));
vi.mock("$lib/util/history", () => ({ earlierPathnames, returnTo }));

let go: MockInstance<History["go"]>;

function at(pathname: string) {
	page.url = new URL(pathname, "https://app.test");
	history.replaceState(null, "", pathname);
}

function withNavigationApi({ earlier }: { earlier: (string | null)[] }) {
	vi.stubGlobal("navigation", {});
	earlierPathnames.mockReturnValue(earlier);
}

function cancels({
	to,
	type = "popstate",
	delta,
}: {
	to: string;
	type?: NavigationType;
	delta?: number;
}): boolean {
	const cancel = vi.fn();
	const navigation = {
		type,
		delta,
		to: { url: new URL(to, page.url) },
		cancel,
	} as unknown as BeforeNavigate;
	for (const [callback] of beforeNavigate.mock.calls) callback(navigation);
	return cancel.mock.calls.length > 0;
}

function revert() {
	dispatchEvent(new PopStateEvent("popstate"));
}

function land(pathname: string) {
	at(pathname);
	const navigation = { to: { url: page.url } } as unknown as AfterNavigate;
	for (const [callback] of afterNavigate.mock.calls) callback(navigation);
}

beforeEach(() => {
	go = vi.spyOn(history, "go").mockImplementation(() => {});
	at("/chat");
	guardDeletedPages();
});

afterEach(() => {
	revert();
	clearAccountCaches();
	go.mockRestore();
	vi.unstubAllGlobals();
	afterNavigate.mockReset();
	beforeNavigate.mockReset();
	earlierPathnames.mockReset();
	returnTo.mockReset();
});

describe("leaveDeletedPages", () => {
	it("returns to the parent when this page is among the deleted", () => {
		at("/chat/1:2");

		leaveDeletedPages({
			pathnames: ["/chat/3:4", "/chat/1:2"],
			parent: "/chat",
		});

		expect(returnTo).toHaveBeenCalledExactlyOnceWith("/chat");
	});

	it("stays on this page when the deleted ones are elsewhere", () => {
		at("/chat/5:6");

		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		expect(returnTo).not.toHaveBeenCalled();
	});

	it("knows this page under its percent-encoded address", () => {
		at("/chat/1%3A2");

		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		expect(returnTo).toHaveBeenCalledExactlyOnceWith("/chat");
	});
});

describe("guardDeletedPages going Forward", () => {
	it("cancels Forward into a page deleted this session", () => {
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		expect(cancels({ to: "/chat/1:2", delta: 1 })).toBe(true);
	});

	it("cancels a jump forward that lands on a deleted page", () => {
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		expect(cancels({ to: "/chat/1:2", delta: 3 })).toBe(true);
	});

	it("cancels Forward into a deleted page's percent-encoded address", () => {
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		expect(cancels({ to: "/chat/1%3A2", delta: 1 })).toBe(true);
	});

	it("lets Forward into a page that was not deleted through", () => {
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		expect(cancels({ to: "/chat/3:4", delta: 1 })).toBe(false);
	});

	it("stays where it is once a cancelled Forward is reverted", () => {
		withNavigationApi({ earlier: ["/chat"] });
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		cancels({ to: "/chat/1:2", delta: 1 });
		revert();

		expect(go).not.toHaveBeenCalled();
		expect(returnTo).not.toHaveBeenCalled();
	});
});

describe("guardDeletedPages going Back", () => {
	beforeEach(() => {
		at("/chat/3:4");
	});

	it("skips past a deleted page to the entry before it once the cancel is reverted", () => {
		withNavigationApi({ earlier: ["/chat", "/"] });
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		expect(cancels({ to: "/chat/1:2", delta: -1 })).toBe(true);
		expect(go, "waits for the revert to land").not.toHaveBeenCalled();
		revert();

		expect(go).toHaveBeenCalledExactlyOnceWith(-2);
	});

	it("skips every consecutive deleted page in one traversal", () => {
		withNavigationApi({ earlier: ["/chat/5:6", "/chat/7%3A8", "/chat"] });
		leaveDeletedPages({
			pathnames: ["/chat/1:2", "/chat/5:6", "/chat/7:8"],
			parent: "/chat",
		});

		cancels({ to: "/chat/1:2", delta: -1 });
		revert();

		expect(go).toHaveBeenCalledExactlyOnceWith(-4);
	});

	it("skips a deleted page that a jump back lands on", () => {
		withNavigationApi({ earlier: ["/chat"] });
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		cancels({ to: "/chat/1:2", delta: -3 });
		revert();

		expect(go).toHaveBeenCalledExactlyOnceWith(-4);
	});

	it("stops at an entry whose address is unknown", () => {
		withNavigationApi({ earlier: [null, "/chat"] });
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		cancels({ to: "/chat/1:2", delta: -1 });
		revert();

		expect(go).toHaveBeenCalledExactlyOnceWith(-2);
	});

	it("returns to the parent when every earlier entry was deleted", () => {
		withNavigationApi({ earlier: ["/chat/5:6"] });
		leaveDeletedPages({
			pathnames: ["/chat/1:2", "/chat/5:6"],
			parent: "/chat",
		});

		cancels({ to: "/chat/1:2", delta: -1 });
		revert();

		expect(returnTo).toHaveBeenCalledExactlyOnceWith("/chat");
		expect(go).not.toHaveBeenCalled();
	});

	it("returns to the deleted page's own parent from the first entry", () => {
		withNavigationApi({ earlier: [] });
		leaveDeletedPages({
			pathnames: ["/settings/albums/9"],
			parent: "/settings/albums",
		});

		cancels({ to: "/settings/albums/9", delta: -1 });
		revert();

		expect(returnTo).toHaveBeenCalledExactlyOnceWith("/settings/albums");
	});

	it("steps one entry further back per deleted page without the Navigation API", () => {
		vi.stubGlobal("navigation", undefined);
		leaveDeletedPages({
			pathnames: ["/chat/1:2", "/chat/5:6"],
			parent: "/chat",
		});

		cancels({ to: "/chat/1:2", delta: -1 });
		revert();
		expect(go).toHaveBeenLastCalledWith(-2);
		cancels({ to: "/chat/5:6", delta: -2 });
		revert();

		expect(go).toHaveBeenLastCalledWith(-3);
		expect(go).toHaveBeenCalledTimes(2);
		expect(earlierPathnames).not.toHaveBeenCalled();
		expect(returnTo).not.toHaveBeenCalled();
	});

	it("drops the skip when the revert does not land back on this page", () => {
		withNavigationApi({ earlier: ["/chat"] });
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		cancels({ to: "/chat/1:2", delta: -1 });
		history.replaceState(null, "", "/chat/9:9");
		revert();
		history.replaceState(null, "", "/chat/3:4");
		revert();

		expect(go).not.toHaveBeenCalled();
	});

	it("lets Back into a page that was not deleted through", () => {
		withNavigationApi({ earlier: ["/chat"] });
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		expect(cancels({ to: "/chat/5:6", delta: -1 })).toBe(false);
		revert();

		expect(go).not.toHaveBeenCalled();
	});
});

describe("guardDeletedPages", () => {
	it("lets a link open a deleted page, which Forward then reaches again", () => {
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		expect(cancels({ to: "/chat/1:2", type: "link" })).toBe(false);
		land("/chat/1:2");
		land("/chat");

		expect(cancels({ to: "/chat/1:2", delta: 1 })).toBe(false);
	});

	it("tolerates an address with a malformed escape", () => {
		leaveDeletedPages({ pathnames: ["/chat/%"], parent: "/chat" });

		expect(cancels({ to: "/chat/%", delta: 1 })).toBe(true);
		expect(() => land("/chat/%")).not.toThrow();
		expect(cancels({ to: "/chat/%", delta: 1 })).toBe(false);
	});

	it("forgets the deleted pages on sign-out", () => {
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		clearAccountCaches();

		expect(cancels({ to: "/chat/1:2", delta: 1 })).toBe(false);
	});
});
