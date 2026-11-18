import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { RovingKey } from "./roving-focus-state.svelte";
import {
	button,
	destroyRovingLists,
	outsideButton,
	press,
	rovingList,
	row,
	rowCells,
	settle,
	tabStops,
} from "./roving-focus-test-helpers.svelte";

vi.mock("$app/navigation", () => ({
	afterNavigate: vi.fn(),
	beforeNavigate: vi.fn(),
}));

beforeEach(() => {
	runningOn("linux");
});

afterEach(() => {
	destroyRovingLists();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
	resetPlatform();
});

type Build = (key: RovingKey) => HTMLElement;

describe("RovingFocusState tab stop", () => {
	it("gives exactly one mounted item the tab stop", async () => {
		const { container, node } = rovingList({ keys: ["a", "b", "c"] });
		await settle();

		expect(tabStops(container)).toEqual([node("a")]);
		expect(node("b").getAttribute("tabindex")).toBe("-1");
		expect(node("c").getAttribute("tabindex")).toBe("-1");
	});

	it("keeps the list itself out of the Tab order while it listens for keys", async () => {
		const { container } = rovingList({ keys: ["a", "b"] });
		await settle();

		expect(container.getAttribute("tabindex")).toBe("-1");
		destroyRovingLists();
		expect(container.hasAttribute("tabindex")).toBe(false);
	});

	it("moves the stop to the item focused or pressed", async () => {
		const { container, node } = rovingList({ keys: ["a", "b", "c", "d"] });
		await settle();

		node("c").focus();
		await settle();
		expect(tabStops(container)).toEqual([node("c")]);

		node("d").dispatchEvent(
			new MouseEvent("pointerdown", { bubbles: true }),
		);
		await settle();
		expect(tabStops(container)).toEqual([node("d")]);
	});

	it("hands the stop to the first visible item when the active item unmounts", async () => {
		const { container, node, unmount, state } = rovingList({
			keys: ["a", "b", "c"],
		});
		state.activeKey = "b";
		await settle();
		unmount("b");
		await settle();

		expect(tabStops(container)).toEqual([node("a")]);
	});

	it("rests on the resting key only while focus is outside", async () => {
		const { container, node } = rovingList({
			keys: ["a", "b", "c"],
			restingKey: () => "c",
		});
		await settle();
		expect(tabStops(container)).toEqual([node("c")]);

		node("a").focus();
		await settle();
		expect(tabStops(container)).toEqual([node("a")]);

		outsideButton().focus();
		await settle();
		expect(tabStops(container)).toEqual([node("c")]);
	});

	it("leaves the native stop without a tabindex", async () => {
		const { container, node } = rovingList({
			keys: ["a", "b"],
			stopTabindex: "native",
		});
		await settle();

		expect(node("a").hasAttribute("tabindex")).toBe(false);
		expect(node("b").getAttribute("tabindex")).toBe("-1");
		expect(tabStops(container)).toEqual([]);
	});

	it("keeps one stop across all cells and demotes cells that appear later", async () => {
		const { container, node } = rovingList({
			keys: ["a", "b"],
			build: (key) => row([`${key}1`, `${key}2`]),
			cells: rowCells,
		});
		await settle();
		expect(tabStops(container)).toEqual([rowCells(node("a"))[0]]);

		node("b").append(button("late"));
		await settle();

		expect(rowCells(node("b"))[2]!.getAttribute("tabindex")).toBe("-1");
		expect(tabStops(container)).toHaveLength(1);
	});

	it("hands the stop on when a resize hides the item that held it", async () => {
		const resized: (() => void)[] = [];
		vi.stubGlobal("ResizeObserver", function (callback: () => void) {
			resized.push(callback);
			return { observe() {}, disconnect() {} };
		});
		let hidden = false;
		const { container, node } = rovingList({
			keys: ["a", "b"],
			build: (key) => {
				const item = button(String(key));
				if (key === "a") item.checkVisibility = () => !hidden;
				return item;
			},
		});
		await settle();
		expect(tabStops(container)).toEqual([node("a")]);

		hidden = true;
		for (const callback of resized) callback();

		expect(tabStops(container)).toEqual([node("b")]);
	});

	it("keeps a stop still in view without measuring the other items", async () => {
		const resized: (() => void)[] = [];
		vi.stubGlobal("ResizeObserver", function (callback: () => void) {
			resized.push(callback);
			return { observe() {}, disconnect() {} };
		});
		const tops: Record<string, number> = { a: -100, b: -50, c: 0, d: 20 };
		const measured: RovingKey[] = [];
		const { container, node } = rovingList({
			keys: ["a", "b", "c", "d"],
			build: (key) => {
				const item = button(String(key));
				item.getBoundingClientRect = () => {
					measured.push(key);
					return {
						top: tops[key],
						bottom: tops[key]! + 10,
					} as DOMRect;
				};
				return item;
			},
		});
		await settle();
		expect(tabStops(container)).toEqual([node("c")]);
		Object.assign(tops, { a: 0, b: 20, c: 40, d: 60 });
		measured.length = 0;

		for (const callback of resized) callback();

		expect(tabStops(container)).toEqual([node("c")]);
		expect(measured).toEqual(["c"]);
	});

	it("looks no further than the first visible item once the stop leaves the view", async () => {
		const resized: (() => void)[] = [];
		vi.stubGlobal("ResizeObserver", function (callback: () => void) {
			resized.push(callback);
			return { observe() {}, disconnect() {} };
		});
		const tops: Record<string, number> = { a: 0, b: 20, c: 40, d: 60 };
		const measured: RovingKey[] = [];
		const { container, node } = rovingList({
			keys: ["a", "b", "c", "d"],
			build: (key) => {
				const item = button(String(key));
				item.getBoundingClientRect = () => {
					measured.push(key);
					return {
						top: tops[key],
						bottom: tops[key]! + 10,
					} as DOMRect;
				};
				return item;
			},
		});
		await settle();
		tops.a = -100;
		tops.b = -50;
		measured.length = 0;

		for (const callback of resized) callback();

		expect(tabStops(container)).toEqual([node("c")]);
		expect(measured).not.toContain("d");
	});

	it("re-points the active item to its neighbor when it leaves the list while focus is outside", async () => {
		const harness = rovingList({ keys: ["a", "b", "c", "d"] });
		await settle();
		harness.node("b").focus();
		const outside = outsideButton();
		outside.focus();

		harness.list.keys = ["a", "c", "d"];
		harness.unmount("b");
		expect(await harness.state.move("next")).toBe(true);
		expect(document.activeElement).toBe(harness.node("d"));

		outside.focus();
		harness.list.keys = ["a", "c"];
		harness.unmount("d");
		await settle();
		expect(tabStops(harness.container)).toEqual([harness.node("c")]);
		expect(await harness.state.focus()).toBe(true);
		expect(document.activeElement).toBe(harness.node("c"));
	});
});

describe("RovingFocusState focus tracking", () => {
	it("changes focusWithin only on focusin, never on blur or focusout", async () => {
		const { state, node } = rovingList({ keys: ["a", "b"] });
		await settle();
		expect(state.focusWithin).toBe(false);

		node("a").focus();
		expect(state.focusWithin).toBe(true);

		node("a").blur();
		node("a").dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
		expect(state.focusWithin).toBe(true);

		outsideButton().focus();
		expect(state.focusWithin).toBe(false);
	});
});

describe("RovingFocusState keys", () => {
	it("moves focus with the arrows and claims only the keys that moved it", async () => {
		const { node } = rovingList({ keys: ["a", "b", "c"] });
		await settle();
		node("a").focus();

		expect(press(node("a"), "ArrowDown").defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(node("b"));

		press(node("b"), "End");
		expect(document.activeElement).toBe(node("c"));

		expect(press(node("c"), "ArrowDown").defaultPrevented).toBe(false);
		expect(document.activeElement).toBe(node("c"));
	});

	it("claims a blocked key at a listed edge or when onEdge handles it", async () => {
		const onEdge = vi.fn((edge: string) => edge === "down");
		const { node } = rovingList({
			keys: ["a", "b"],
			consumeAtEdge: ["up"],
			onEdge,
		});
		await settle();

		expect(press(node("a"), "ArrowUp").defaultPrevented).toBe(true);
		expect(press(node("b"), "ArrowDown").defaultPrevented).toBe(true);
		expect(onEdge.mock.calls).toEqual([["up"], ["down"]]);
	});

	it("passes keys from text fields, nested widgets, compositions and handled events", async () => {
		const { node } = rovingList({
			keys: ["a", "b"],
			build: (key) => {
				const item = button(String(key));
				item.append(document.createElement("input"), button("nested"));
				return item;
			},
		});
		await settle();
		node("a").focus();

		press(node("a").querySelector("input")!, "ArrowDown");
		press(node("a").querySelector("button")!, "ArrowDown");
		press(node("a"), "ArrowDown", { isComposing: true });
		const handled = new KeyboardEvent("keydown", {
			key: "ArrowDown",
			bubbles: true,
			cancelable: true,
		});
		handled.preventDefault();
		node("a").dispatchEvent(handled);

		expect(document.activeElement).toBe(node("a"));
	});

	it("loops a toolbar and flips Left and Right under RTL", async () => {
		const { node, container } = rovingList({
			keys: ["a", "b", "c"],
			orientation: "horizontal",
			wrap: "loop",
		});
		await settle();

		press(node("a"), "ArrowLeft");
		expect(document.activeElement).toBe(node("c"));

		container.style.direction = "rtl";
		press(node("c"), "ArrowLeft");
		expect(document.activeElement).toBe(node("a"));
	});

	it("moves by rows in a grid and pages by the given rows", async () => {
		const { node } = rovingList({
			keys: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
			orientation: "grid",
			columns: () => 3,
			pageRows: () => 2,
		});
		await settle();

		press(node(1), "ArrowDown");
		expect(document.activeElement).toBe(node(4));

		press(node(4), "PageDown");
		expect(document.activeElement).toBe(node(9));

		press(node(9), "Home");
		expect(document.activeElement).toBe(node(9));
		press(node(9), "ArrowUp");
		expect(document.activeElement).toBe(node(6));
	});

	it("matches typed text by prefix from the next item onward", async () => {
		vi.useFakeTimers();
		const { node } = rovingList({
			keys: ["apple", "banana", "blueberry", "cherry"],
			typeahead: (item) => item.textContent ?? "",
		});
		await settle();

		press(node("apple"), "b");
		expect(document.activeElement).toBe(node("banana"));
		press(node("banana"), "b");
		expect(document.activeElement).toBe(node("blueberry"));

		vi.advanceTimersByTime(600);
		press(node("blueberry"), "c");
		press(node("cherry"), "h");
		expect(document.activeElement).toBe(node("cherry"));
		expect(press(node("cherry"), " ").defaultPrevented).toBe(false);
	});
});

describe("RovingFocusState cells", () => {
	const cellRows = {
		"0": ["0a", "0b", "0c"],
		"1": ["1a"],
		"2": [],
		"3": ["3a", "3b", "3c"],
	} as Record<string, string[]>;
	const build: Build = (key) => row(cellRows[key]!);

	it("moves between cells with Left and Right without leaving the row", async () => {
		const { node, container } = rovingList({
			keys: ["0"],
			build,
			cells: rowCells,
		});
		await settle();
		const [first, second] = rowCells(node("0"));
		first!.focus();

		press(first!, "ArrowRight");
		expect(document.activeElement).toBe(second);
		await settle();
		expect(tabStops(container)).toEqual([second]);
		press(second!, "ArrowLeft");
		expect(press(first!, "ArrowLeft").defaultPrevented).toBe(false);
		expect(document.activeElement).toBe(first);
	});

	it("keeps the column across rows, clamps short rows and skips rows without cells", async () => {
		const { node } = rovingList({
			keys: ["0", "1", "2", "3"],
			build,
			cells: rowCells,
		});
		await settle();
		const third = rowCells(node("0"))[2]!;
		third.focus();

		press(third, "ArrowDown");
		expect(document.activeElement).toBe(rowCells(node("1"))[0]);

		press(document.activeElement!, "ArrowDown");
		expect(document.activeElement).toBe(rowCells(node("3"))[2]);
	});

	it("lands on the primary cell when rows change in primary mode", async () => {
		const { node } = rovingList({
			keys: ["0", "3"],
			build,
			cells: rowCells,
			cellOnRowChange: "primary",
			primaryCell: (cells) => cells.at(-1)!,
		});
		await settle();
		const first = rowCells(node("0"))[0]!;
		first.focus();

		press(first, "ArrowDown");

		expect(document.activeElement).toBe(rowCells(node("3"))[2]);
	});

	it("lands on the primary cell when coming back to the row the column was set in", async () => {
		const { node } = rovingList({
			keys: ["0", "3"],
			build,
			cells: rowCells,
			cellOnRowChange: "primary",
		});
		await settle();
		const third = rowCells(node("0"))[2]!;
		third.focus();

		press(third, "ArrowDown");
		expect(document.activeElement).toBe(rowCells(node("3"))[0]);
		press(document.activeElement!, "ArrowUp");

		expect(document.activeElement).toBe(rowCells(node("0"))[0]);
	});
});

describe("RovingFocusState unmounted targets", () => {
	it("steps past or stops at listed items it cannot mount without reveal", async () => {
		const onEdge = vi.fn(() => false);
		const { node } = rovingList({
			keys: ["a", "b", "c", "d"],
			mounted: ["a", "c"],
			onEdge,
		});
		await settle();
		node("a").focus();

		press(node("a"), "ArrowDown");
		expect(document.activeElement).toBe(node("c"));

		expect(press(node("c"), "ArrowDown").defaultPrevented).toBe(false);
		expect(onEdge).toHaveBeenCalledExactlyOnceWith("down");
		expect(document.activeElement).toBe(node("c"));
	});

	it("reveals an unmounted target and focuses it once it registers", async () => {
		const reveal = vi.fn();
		const harness = rovingList({
			keys: ["a", "b", "c"],
			mounted: ["a", "b"],
			reveal,
		});
		await settle();
		harness.node("b").focus();

		expect(press(harness.node("b"), "ArrowDown").defaultPrevented).toBe(
			true,
		);
		expect(reveal).toHaveBeenCalledExactlyOnceWith(2);

		harness.mount("c");
		const focus = vi.spyOn(harness.node("c"), "focus");
		await settle();

		expect(focus).toHaveBeenCalledWith({ preventScroll: true });
		expect(document.activeElement).toBe(harness.node("c"));
	});

	it("gives up when the target never registers", async () => {
		vi.useFakeTimers();
		const { node, state } = rovingList({
			keys: ["a", "b"],
			mounted: ["a"],
			reveal: () => {},
		});
		await settle();
		node("a").focus();

		const landed = state.move("next");
		await vi.advanceTimersByTimeAsync(500);

		expect(await landed).toBe(false);
		expect(document.activeElement).toBe(node("a"));
	});
});

describe("RovingFocusState focus loss", () => {
	it("holds focus on the container while the focused item tears down, then focuses the same index", async () => {
		const harness = rovingList({ keys: ["a", "b", "c"] });
		await settle();
		harness.node("b").focus();

		harness.list.keys = ["a", "c"];
		harness.unmount("b");

		expect(document.activeElement).toBe(harness.container);
		expect(harness.container.hasAttribute("data-roving-holder")).toBe(true);
		await settle();

		expect(document.activeElement).toBe(harness.node("c"));
		expect(harness.container.hasAttribute("data-roving-holder")).toBe(
			false,
		);
		expect(harness.container.getAttribute("tabindex")).toBe("-1");
	});

	it("focuses the nearest visible item when a still-listed item unmounts", async () => {
		const harness = rovingList({ keys: ["a", "b", "c"] });
		await settle();
		harness.node("c").focus();

		harness.unmount("c");
		await settle();

		expect(document.activeElement).toBe(harness.node("b"));
	});

	it("falls back when the list empties and keeps the holder until focus leaves", async () => {
		const fallback = outsideButton();
		const withFallback = rovingList({
			keys: ["a"],
			emptyFallback: () => fallback,
		});
		await settle();
		withFallback.node("a").focus();
		withFallback.list.keys = [];
		withFallback.unmount("a");
		await settle();
		expect(document.activeElement).toBe(fallback);

		const bare = rovingList({ keys: ["x"] });
		await settle();
		bare.node("x").focus();
		bare.list.keys = [];
		bare.unmount("x");
		await settle();
		expect(document.activeElement).toBe(bare.container);
		expect(bare.container.getAttribute("tabindex")).toBe("-1");

		expect(bare.container.hasAttribute("data-roving-holder")).toBe(true);

		fallback.focus();
		expect(bare.container.hasAttribute("data-roving-holder")).toBe(false);
		expect(bare.container.getAttribute("tabindex")).toBe("-1");
	});

	it("refocuses an item that a keyed move pulled focus from", async () => {
		const { node, container } = rovingList({ keys: ["a", "b", "c"] });
		await settle();
		node("c").focus();

		container.insertBefore(node("c"), node("a"));
		expect(document.activeElement).toBe(document.body);
		await settle();

		expect(document.activeElement).toBe(node("c"));
	});

	it("moves focus off an item that turns inert", async () => {
		const { node } = rovingList({ keys: ["a", "b", "c"] });
		await settle();
		node("b").focus();

		node("b").setAttribute("inert", "");
		node("b").blur();
		await settle();

		expect(document.activeElement).toBe(node("a"));
	});

	it("never pulls focus back after a press outside the focused item", async () => {
		const { node, container } = rovingList({ keys: ["a", "b"] });
		await settle();
		node("b").focus();

		document.body.dispatchEvent(
			new MouseEvent("pointerdown", { bubbles: true }),
		);
		node("b").blur();
		container.insertBefore(node("b"), node("a"));
		await settle();

		expect(document.activeElement).toBe(document.body);
	});
});

describe("RovingFocusState scroll", () => {
	beforeEach(() => {
		vi.spyOn(window, "innerHeight", "get").mockReturnValue(300);
	});

	it("follows the first fully visible item after a scroll while focus is outside", async () => {
		const scroller = document.createElement("div");
		scroller.style.overflowY = "auto";
		document.body.append(scroller);
		scroller.getBoundingClientRect = () =>
			({ top: 0, bottom: 300 }) as DOMRect;
		const tops: Record<string, number> = { a: -150, b: -50, c: 60, d: 200 };
		const harness = rovingList({
			keys: ["a", "b", "c", "d"],
			followScroll: "first-visible",
			parent: scroller,
			build: (key) => {
				const item = button(String(key));
				item.getBoundingClientRect = () =>
					({ top: tops[key], bottom: tops[key]! + 90 }) as DOMRect;
				return item;
			},
		});
		await settle();

		scroller.dispatchEvent(new Event("scrollend"));
		await settle();

		expect(harness.state.activeKey).toBe("c");
		expect(tabStops(harness.container)).toEqual([harness.node("c")]);
	});

	it("follows the scrolling of a list that is its own scroller", async () => {
		const container = document.createElement("div");
		container.style.overflowY = "auto";
		container.getBoundingClientRect = () =>
			({ top: 100, bottom: 300 }) as DOMRect;
		const tops: Record<string, number> = { a: 50, b: 150 };
		const harness = rovingList({
			keys: ["a", "b"],
			followScroll: "first-visible",
			container,
			build: (key) => {
				const item = button(String(key));
				item.getBoundingClientRect = () =>
					({ top: tops[key], bottom: tops[key]! + 90 }) as DOMRect;
				return item;
			},
		});
		await settle();

		container.dispatchEvent(new Event("scrollend"));
		await settle();

		expect(harness.state.activeKey).toBe("b");
	});
});
