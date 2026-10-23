import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	AfterNavigate,
	BeforeNavigate,
	NavigationType,
} from "@sveltejs/kit";

import { clearAccountCaches } from "$lib/api/account-caches";
import { guardDeletedPages, leaveDeletedPages } from "$lib/util/deleted-pages";

const { afterNavigate, beforeNavigate, page, returnTo } = vi.hoisted(() => ({
	afterNavigate:
		vi.fn<(callback: (navigation: AfterNavigate) => void) => void>(),
	beforeNavigate:
		vi.fn<(callback: (navigation: BeforeNavigate) => void) => void>(),
	page: { url: new URL("https://app.test/chat") },
	returnTo: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ afterNavigate, beforeNavigate }));
vi.mock("$app/state", () => ({ page }));
vi.mock("$lib/util/history", () => ({ returnTo }));

function at(pathname: string) {
	page.url = new URL(pathname, "https://app.test");
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

function land(pathname: string) {
	at(pathname);
	const navigation = { to: { url: page.url } } as unknown as AfterNavigate;
	for (const [callback] of afterNavigate.mock.calls) callback(navigation);
}

beforeEach(() => {
	at("/chat");
	guardDeletedPages();
});

afterEach(() => {
	clearAccountCaches();
	afterNavigate.mockReset();
	beforeNavigate.mockReset();
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

describe("guardDeletedPages", () => {
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

	it("leaves Back into a deleted page alone", () => {
		at("/chat/3:4");
		leaveDeletedPages({ pathnames: ["/chat/1:2"], parent: "/chat" });

		expect(cancels({ to: "/chat/1:2", delta: -1 })).toBe(false);
	});

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
