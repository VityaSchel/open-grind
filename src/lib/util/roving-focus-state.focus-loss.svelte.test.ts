import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { RovingKey } from "./roving-focus-state.svelte";
import {
	destroyRovingLists,
	outsideButton,
	press,
	rovingList,
	row,
	rowCells,
	settle,
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
	document.body.replaceChildren();
	resetPlatform();
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

	it("focuses the first key and reveals it when it is not mounted", async () => {
		const reveal = vi.fn();
		const harness = rovingList({
			keys: ["a", "b", "c"],
			mounted: ["b", "c"],
			reveal,
		});
		await settle();
		harness.node("c").focus();

		const focusing = harness.state.focusFirst();
		expect(reveal).toHaveBeenCalledExactlyOnceWith(0);
		harness.mount("a");
		await settle();
		await focusing;

		expect(document.activeElement).toBe(harness.node("a"));
	});

	it("focuses the first key that can take focus and does nothing on an empty list", async () => {
		const cellRows: Record<string, string[]> = { "0": [], "1": ["1a"] };
		const listed = rovingList({
			keys: ["0", "1"],
			build: (key: RovingKey) => row(cellRows[key]!),
			cells: rowCells,
		});
		await settle();
		await listed.state.focusFirst();
		expect(document.activeElement).toBe(rowCells(listed.node("1"))[0]);

		const outside = outsideButton();
		outside.focus();
		const empty = rovingList({ keys: [] });
		await settle();
		await empty.state.focusFirst();
		expect(document.activeElement).toBe(outside);
	});

	it("gives up when the target never registers", async () => {
		vi.useFakeTimers();
		const { node, mount } = rovingList({
			keys: ["a", "b"],
			mounted: ["a"],
			reveal: () => {},
		});
		await settle();
		node("a").focus();

		expect(press(node("a"), "ArrowDown").defaultPrevented).toBe(true);
		await vi.advanceTimersByTimeAsync(500);
		mount("b");
		await settle();

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

	it("passes over rows without a focusable cell when the focused row tears down", async () => {
		const cellRows: Record<string, string[]> = {
			"0": ["0a"],
			"1": ["1a"],
			"2": [],
			"3": ["3a"],
		};
		const options = {
			keys: ["0", "1", "2", "3"],
			build: (key: RovingKey) => row(cellRows[key]!),
			cells: rowCells,
		};
		const listed = rovingList(options);
		await settle();
		rowCells(listed.node("3"))[0]!.focus();
		listed.unmount("3");
		await settle();
		expect(document.activeElement).toBe(rowCells(listed.node("1"))[0]);
		listed.detach();

		const dropped = rovingList(options);
		await settle();
		rowCells(dropped.node("3"))[0]!.focus();
		dropped.list.keys = ["0", "1", "2"];
		dropped.unmount("3");
		await settle();
		expect(document.activeElement).toBe(rowCells(dropped.node("1"))[0]);
	});

	it("passes over rows without a focusable cell when the focused row turns inert", async () => {
		const cellRows: Record<string, string[]> = {
			"0": ["0a"],
			"1": ["1a"],
			"2": [],
			"3": ["3a"],
		};
		const { node } = rovingList({
			keys: ["0", "1", "2", "3"],
			build: (key: RovingKey) => row(cellRows[key]!),
			cells: rowCells,
		});
		await settle();
		const cell = rowCells(node("3"))[0]!;
		cell.focus();

		node("3").setAttribute("inert", "");
		cell.blur();
		await settle();

		expect(document.activeElement).toBe(rowCells(node("1"))[0]);
	});

	it("focuses the nearest visible item when a still-listed item unmounts", async () => {
		const harness = rovingList({ keys: ["a", "b", "c"] });
		await settle();
		harness.node("c").focus();

		harness.unmount("c");
		await settle();

		expect(document.activeElement).toBe(harness.node("b"));
	});

	it("keeps focus on an item whose node is recreated outside the visible band", async () => {
		const harness = rovingList({ keys: ["a", "b", "c"] });
		await settle();
		harness.node("c").focus();

		harness.unmount("c");
		harness.mount("c");
		vi.spyOn(harness.node("c"), "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, innerHeight + 100, 100, 100),
		);
		await settle();

		expect(document.activeElement).toBe(harness.node("c"));
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
