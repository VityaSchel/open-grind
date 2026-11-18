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
vi.mock("#lib/util/history.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/util/history.ts")>()),
	navigationPending: () => false,
}));

import { onNavigate } from "$app/navigation";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { HISTORY_METADATA_KEY } from "#lib/util/history-index.ts";
import { navBarRider, screenRoot } from "./screen-root";
import { screenSnapshots } from "./screen-snapshots.svelte";
import ScreenStack from "./ScreenStack.svelte";
import { snapshotScreen } from "./snapshot";
import { flushMicrotasks, navigationEvent } from "./stack-test-helpers";

const NAV_BAR_COPY_HIDDEN = "**:data-[slot=navbar]:invisible";
const INBOX =
	'<div data-slot="live-stack-base"><main>inbox</main><nav data-slot="navbar">tabs</nav></div>';
const CONVERSATION =
	'<div data-covered inert><nav data-slot="navbar"></nav></div><main>chat</main>';

function enter({ path, index }: { path: string; index: number }) {
	history.pushState(
		{ [HISTORY_METADATA_KEY]: { historyIndex: index } },
		"",
		path,
	);
}

function profileOver({ path, html }: { path: string; html: string }) {
	vi.stubGlobal("navigation", {
		currentEntry: { index: 1 },
		entries: () =>
			[path, "/profile/7"].map((entry) => ({
				url: `${location.origin}${entry}`,
			})),
	});
	const behind = document.createElement("div");
	behind.innerHTML = html;
	enter({ path, index: 0 });
	screenSnapshots.navigated({ type: "link" });
	enter({ path: "/profile/7", index: 1 });
	screenSnapshots.remember({
		snapshot: snapshotScreen({ root: behind, path }),
		kind: "screen",
	});
	screenSnapshots.navigated({ type: "link" });
}

function profileOverGrid() {
	profileOver({ path: "/", html: "<p>grid</p>" });
}

async function swipedBack(stack: SwipeBackStack) {
	stack.beginSwipeBack();
	stack.trackSwipeBack(0.6);
	stack.commitSwipeBack();
	await flushMicrotasks();
	flushSync();
}

function landedBackOn(path: string) {
	enter({ path, index: 0 });
	const navigated = vi.mocked(onNavigate).mock.calls.at(-1)![0];
	void navigated(
		navigationEvent({ from: "/profile/7", to: path, delta: -1 }),
	);
	flushSync();
}

function riderNavBar() {
	const navBar = document.createElement("nav");
	document.body.append(navBar);
	const detach = navBarRider(navBar);
	return { navBar, detach };
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
	it("moves the NavBar along with the screen over a conversation, which shows none, and back with it", () => {
		profileOver({ path: "/chat/1:2", html: CONVERSATION });
		const { navBar, detach } = riderNavBar();
		const { column, host, stack } = renderScreenStack();
		expect(host()?.querySelector("main")?.textContent).toBe("chat");

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.5);
		flushSync();
		expect(navBar.style.transform).toBe("translate3d(50.000%,0,0)");
		expect(navBar.style.transform).toBe(column.style.transform);

		stack.trackSwipeBack(0);
		expect(navBar.style.transform).toBe("");
		detach?.();
	});

	it("leaves the NavBar in place over a screen it stays over", () => {
		profileOverGrid();
		const { navBar, detach } = riderNavBar();
		const { column, stack } = renderScreenStack();

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.5);
		flushSync();

		expect(column.style.transform).toBe("translate3d(50.000%,0,0)");
		expect(navBar.style.transform).toBe("");
		detach?.();
	});

	it("makes the NavBar riding over a conversation inert along with the screen once a swipe commits", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		vi.spyOn(history, "back").mockImplementation(() => {});
		profileOver({ path: "/chat/1:2", html: CONVERSATION });
		const { navBar, detach } = riderNavBar();
		const { column, stack } = renderScreenStack();

		await swipedBack(stack);

		expect(column.inert).toBe(true);
		expect(navBar.inert).toBe(true);
		detach?.();
	});

	it("leaves the NavBar usable over a screen it stays over once a swipe commits", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		vi.spyOn(history, "back").mockImplementation(() => {});
		profileOverGrid();
		const { navBar, detach } = riderNavBar();
		const { column, stack } = renderScreenStack();

		await swipedBack(stack);

		expect(column.inert).toBe(true);
		expect(navBar.inert).toBeFalsy();
		detach?.();
	});

	it("keeps the inbox's NavBar copy hidden under the live NavBar, and shows it while the picture covers the inbox landed on", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		profileOver({ path: "/chat", html: INBOX });
		const { host, stack } = renderScreenStack();
		expect(host()?.querySelector('[data-slot="navbar"]')).not.toBeNull();
		expect(host()?.classList).toContain(NAV_BAR_COPY_HIDDEN);

		await swipedBack(stack);
		expect(back).toHaveBeenCalledOnce();
		expect(host()?.classList).toContain(NAV_BAR_COPY_HIDDEN);

		landedBackOn("/chat");

		expect(host()?.style.zIndex).toBe("49");
		expect(host()?.classList).not.toContain(NAV_BAR_COPY_HIDDEN);
		expect(host()?.classList).not.toContain("invisible");
		expect(host()?.querySelector('[data-slot="navbar"]')).not.toBeNull();
	});
});
