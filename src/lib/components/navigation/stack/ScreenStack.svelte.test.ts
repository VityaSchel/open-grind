// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet, flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SwipeBackStack } from "#lib/platform/system-back-gesture.svelte.ts";

const { attached } = vi.hoisted(() => ({ attached: [] as SwipeBackStack[] }));

vi.mock("$app/navigation", () => ({
	afterNavigate: vi.fn(),
	onNavigate: vi.fn(),
}));
vi.mock(
	"#lib/platform/system-back-gesture.svelte.ts",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("#lib/platform/system-back-gesture.svelte.ts")
		>()),
		attachSystemBackGesture: (stack: SwipeBackStack) => {
			attached.push(stack);
			return () => {};
		},
	}),
);

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { HISTORY_METADATA_KEY } from "#lib/util/history-index.ts";
import { screenRoot } from "./screen-root";
import { screenSnapshots } from "./screen-snapshots.svelte";
import ScreenStack from "./ScreenStack.svelte";
import { snapshotScreen } from "./snapshot";

function enter({ path, index }: { path: string; index: number }) {
	history.pushState(
		{ [HISTORY_METADATA_KEY]: { historyIndex: index } },
		"",
		path,
	);
}

function profileOverGrid() {
	vi.stubGlobal("navigation", {
		currentEntry: { index: 1 },
		entries: () =>
			["/", "/profile/7"].map((path) => ({
				url: `${location.origin}${path}`,
			})),
	});
	const grid = document.createElement("div");
	grid.innerHTML = "<p>grid</p>";
	enter({ path: "/", index: 0 });
	screenSnapshots.navigated({ type: "link" });
	enter({ path: "/profile/7", index: 1 });
	screenSnapshots.remember({
		snapshot: snapshotScreen({ root: grid, path: "/" }),
		kind: "screen",
	});
	screenSnapshots.navigated({ type: "link" });
}

function renderScreenStack() {
	const { container } = render(ScreenStack, {
		props: {
			children: createRawSnippet(() => ({
				render: () => `<div data-slot="column"><p>profile</p></div>`,
			})),
		},
	});
	const column = container.querySelector<HTMLElement>(
		'[data-slot="column"]',
	)!;
	const detach = screenRoot(column);
	flushSync();
	const host = () =>
		container.querySelector<HTMLElement>('[data-slot="screen-stack-host"]');
	return { container, column, host, detach, stack: attached[0]! };
}

beforeEach(() => runningOn("ios"));

afterEach(() => {
	cleanup();
	resetPlatform();
	screenSnapshots.clear();
	attached.length = 0;
	history.replaceState(null, "", "/");
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("ScreenStack", () => {
	it("stages the picture behind hidden after the routed screen, and raises the screen over it", () => {
		profileOverGrid();
		const { container, column, host, detach } = renderScreenStack();

		const staged = host();
		expect(staged?.textContent).toBe("grid");
		expect(staged?.classList).toContain("invisible");
		expect(
			column.compareDocumentPosition(staged!) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect([...column.classList]).toEqual(
			expect.arrayContaining(["relative", "bg-background"]),
		);
		expect(column.style.zIndex).toBe("12");

		detach?.();
		flushSync();
		expect(
			container.querySelector('[data-slot="screen-ghost"]'),
		).toBeNull();
		expect(column.classList).not.toContain("relative");
		expect(column.style.zIndex).toBe("");
	});

	it("stages nothing and leaves the screen alone without a picture behind", () => {
		const { column, host } = renderScreenStack();

		expect(host()).toBeNull();
		expect(column.classList).not.toContain("relative");
		expect(column.style.zIndex).toBe("");
	});

	it("reveals the staged picture to prepare for a swipe", () => {
		profileOverGrid();
		const { host, stack } = renderScreenStack();
		const staged = host();

		stack.prepareSwipeBack?.();
		flushSync();

		expect(host()).toBe(staged);
		expect(host()?.classList).not.toContain("invisible");
	});

	it("makes the screen inert once a swipe commits", () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		vi.spyOn(history, "back").mockImplementation(() => {});
		profileOverGrid();
		const { column, container, stack } = renderScreenStack();

		stack.beginSwipeBack();
		flushSync();
		expect(
			container.querySelector('[data-slot="screen-stack-dim"]'),
		).not.toBeNull();
		expect(column.inert).toBeFalsy();

		stack.trackSwipeBack(0.6);
		stack.commitSwipeBack();
		flushSync();
		expect(column.inert).toBe(true);
	});
});
