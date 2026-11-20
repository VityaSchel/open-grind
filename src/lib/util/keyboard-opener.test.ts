import { afterEach, describe, expect, it, vi } from "vitest";

import { type KeyboardOpener, KeyboardOpenerScope } from "./keyboard-opener";

type Navigated = (navigation: { type: string }) => void;

const { afterNavigate, beforeNavigate } = vi.hoisted(() => ({
	afterNavigate: vi.fn<(callback: Navigated) => void>(),
	beforeNavigate: vi.fn<(callback: () => void) => void>(),
}));

vi.mock("$app/navigation", () => ({ afterNavigate, beforeNavigate }));

afterEach(() => {
	afterNavigate.mockReset();
	beforeNavigate.mockReset();
	history.replaceState(null, "", "/");
	document.body.replaceChildren();
});

function visit(path: string): void {
	history.pushState(null, "", path);
}

function goBackTo(path: string): void {
	history.replaceState(null, "", path);
	dispatchEvent(new PopStateEvent("popstate"));
}

function watchedList(scope: string) {
	const container = document.createElement("div");
	for (const [index, key] of ["a", "b"].entries()) {
		const item = document.createElement("button");
		item.dataset.key = key;
		item.dataset.index = String(index);
		container.append(item);
	}
	document.body.append(container);
	const opener = new KeyboardOpenerScope(scope);
	const navigated = afterNavigate.mock.lastCall![0];
	const navigationStarted = beforeNavigate.mock.lastCall![0];
	const listening = new AbortController();
	opener.watch({
		container,
		signal: listening.signal,
		openerAt: (target) =>
			target instanceof HTMLElement && target.dataset.key !== undefined
				? {
						key: target.dataset.key,
						index: Number(target.dataset.index),
					}
				: null,
	});
	return {
		opener,
		navigateKeepingList: () => navigated({ type: "link" }),
		startNavigation: () => navigationStarted(),
		activate: ({ key, detail }: { key: string; detail: number }) =>
			container
				.querySelector(`[data-key="${key}"]`)!
				.dispatchEvent(
					new MouseEvent("click", { bubbles: true, detail }),
				),
		leave: () => listening.abort(),
	};
}

function openFromKeyboard({ path, key }: { path: string; key: string }) {
	visit(path);
	const list = watchedList(path);
	list.activate({ key, detail: 0 });
	visit("/profile/1");
	list.leave();
}

function comeBackTo(path: string): KeyboardOpener | null {
	goBackTo(path);
	return watchedList(path).opener.returning;
}

describe("KeyboardOpenerScope", () => {
	it("hands back the item activated from the keyboard when Back returns to its page", () => {
		openFromKeyboard({ path: "/browse", key: "b" });

		expect(comeBackTo("/browse")).toEqual({ key: "b", index: 1 });
	});

	it("hands the opener back only once", () => {
		openFromKeyboard({ path: "/taps", key: "a" });
		comeBackTo("/taps");

		expect(watchedList("/taps").opener.returning).toBeNull();
	});

	it("keeps the opener through Back steps that stop on other pages first", () => {
		openFromKeyboard({ path: "/blocked", key: "b" });
		visit("/profile/2");
		goBackTo("/profile/1");

		expect(comeBackTo("/blocked")).toEqual({ key: "b", index: 1 });
	});

	it("drops the opener when a forward navigation brings the list back", () => {
		openFromKeyboard({ path: "/inbox", key: "b" });
		visit("/inbox");
		const forward = watchedList("/inbox");

		expect(forward.opener.returning).toBeNull();
		expect(comeBackTo("/inbox")).toBeNull();
	});

	it("forgets an activation followed by a pointer click, a focus move out of the list or a navigation that kept the list", () => {
		visit("/clicked");
		const clicked = watchedList("/clicked");
		clicked.activate({ key: "b", detail: 0 });
		clicked.activate({ key: "a", detail: 1 });
		visit("/profile/1");
		clicked.leave();
		const clickedReturn = comeBackTo("/clicked");

		visit("/moved");
		const movedAway = watchedList("/moved");
		movedAway.activate({ key: "b", detail: 0 });
		const outside = document.createElement("button");
		document.body.append(outside);
		outside.focus();
		visit("/profile/1");
		movedAway.leave();
		const movedReturn = comeBackTo("/moved");

		visit("/kept");
		const kept = watchedList("/kept");
		kept.activate({ key: "b", detail: 0 });
		kept.navigateKeepingList();
		visit("/profile/1");
		kept.leave();
		const keptReturn = comeBackTo("/kept");

		expect([clickedReturn, movedReturn, keptReturn]).toEqual([
			null,
			null,
			null,
		]);
	});

	it("returns to the opener, to the item in its place once it left, or to the item redirect names", () => {
		openFromKeyboard({ path: "/views", key: "b" });
		goBackTo("/views");
		const { opener } = watchedList("/views");

		expect(opener.returnKey({ keys: ["a", "b", "c"] })).toBe("b");
		expect(opener.returnKey({ keys: ["a", "c"] })).toBe("c");
		expect(opener.returnKey({ keys: ["a"] })).toBe("a");
		expect(
			opener.returnKey({ keys: ["a", "b", "c"], redirect: () => "c" }),
		).toBe("c");
		expect(opener.returnKey({ keys: [] })).toBeNull();
	});

	it("forgets the opener it returns to once another navigation starts", () => {
		openFromKeyboard({ path: "/albums", key: "b" });
		goBackTo("/albums");
		const returned = watchedList("/albums");

		returned.startNavigation();

		expect(returned.opener.returning).toBeNull();
	});
});
