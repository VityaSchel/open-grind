import { afterEach, describe, expect, it, vi } from "vitest";

import type { RovingKey } from "./roving-focus-state.svelte";
import {
	destroyRovingLists,
	outsideButton,
	rovingList,
	settle,
	tabStops,
} from "./roving-focus-test-helpers.svelte";

const { beforeNavigate } = vi.hoisted(() => ({
	beforeNavigate: vi.fn<(callback: () => void) => void>(),
}));

vi.mock("$app/navigation", () => ({ afterNavigate: vi.fn(), beforeNavigate }));

afterEach(() => {
	destroyRovingLists();
	beforeNavigate.mockReset();
	document.body.replaceChildren();
});

function goBack(): void {
	dispatchEvent(new PopStateEvent("popstate"));
}

async function openFromKeyboard({
	keys,
	key,
}: {
	keys: RovingKey[];
	key: RovingKey;
}): Promise<void> {
	const left = rovingList({ keys, openerScope: "/list" });
	await settle();
	left.node(key).dispatchEvent(
		new MouseEvent("click", { bubbles: true, detail: 0 }),
	);
	left.detach();
}

describe("RovingFocusState keyboard openers", () => {
	it("restores the keyboard opener on a back navigation without taking focus from another element", async () => {
		await openFromKeyboard({ keys: ["a", "b"], key: "b" });
		goBack();
		const returned = rovingList({ keys: ["a", "b"], openerScope: "/list" });
		await settle();
		expect(document.activeElement).toBe(returned.node("b"));

		returned.detach();
		await openFromKeyboard({ keys: ["a", "b"], key: "b" });
		const outside = outsideButton();
		outside.focus();
		goBack();
		const behindFocus = rovingList({
			keys: ["a", "b"],
			openerScope: "/list",
		});
		await settle();
		expect(document.activeElement).toBe(outside);
		expect(tabStops(behindFocus.container)).toEqual([
			behindFocus.node("b"),
		]);
	});

	it("lands on the item now in the opener's place when the opener left the list", async () => {
		await openFromKeyboard({ keys: ["a", "b", "c"], key: "b" });
		goBack();
		const returned = rovingList({ keys: ["a", "c"], openerScope: "/list" });
		await settle();

		expect(document.activeElement).toBe(returned.node("c"));
	});

	it("restores the opener once the keys of a list that came back arrive", async () => {
		await openFromKeyboard({ keys: ["a", "b", "c"], key: "c" });
		goBack();
		const loading = rovingList({ keys: [], openerScope: "/list" });
		await settle();
		expect(document.activeElement).toBe(document.body);

		loading.list.keys = ["a", "b", "c"];
		for (const key of loading.list.keys) loading.mount(key);
		await settle();

		expect(document.activeElement).toBe(loading.node("c"));
	});

	it("lands on the empty fallback once a list that came back shows it is empty", async () => {
		await openFromKeyboard({ keys: ["a", "b"], key: "b" });
		goBack();
		const emptyState = $state<{ element: HTMLElement | null }>({
			element: null,
		});
		rovingList({
			keys: [],
			openerScope: "/list",
			emptyFallback: () => emptyState.element,
		});
		await settle();
		expect(document.activeElement).toBe(document.body);

		const shown = document.createElement("div");
		shown.tabIndex = -1;
		document.body.append(shown);
		emptyState.element = shown;
		await settle();

		expect(document.activeElement).toBe(shown);
	});

	it("drops an opener still waiting for its keys once another navigation starts", async () => {
		await openFromKeyboard({ keys: ["a", "b"], key: "b" });
		goBack();
		const loading = rovingList({ keys: [], openerScope: "/list" });
		await settle();

		beforeNavigate.mock.lastCall![0]();
		loading.list.keys = ["a", "b"];
		for (const key of loading.list.keys) loading.mount(key);
		await settle();

		expect(document.activeElement).toBe(document.body);
		expect(tabStops(loading.container)).toEqual([loading.node("a")]);
	});

	it("returns focus to the item returnFocusTo names in place of the opener", async () => {
		await openFromKeyboard({ keys: ["a", "b", "c"], key: "a" });
		goBack();
		const returned = rovingList({
			keys: ["a", "b", "c"],
			openerScope: "/list",
			returnFocusTo: () => "c",
		});
		await settle();

		expect(document.activeElement).toBe(returned.node("c"));
	});

	it("leaves focus alone when a forward navigation brings the list back", async () => {
		await openFromKeyboard({ keys: ["a", "b"], key: "b" });
		const forward = rovingList({ keys: ["a", "b"], openerScope: "/list" });
		await settle();

		expect(document.activeElement).toBe(document.body);
		expect(tabStops(forward.container)).toEqual([forward.node("a")]);
	});
});
