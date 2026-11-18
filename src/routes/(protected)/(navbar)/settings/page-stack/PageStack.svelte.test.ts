// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet, flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { attached } = vi.hoisted(() => ({
	attached: [] as { readonly offersSwipeBack: boolean }[],
}));

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
		attachSystemBackGesture: (stack: {
			readonly offersSwipeBack: boolean;
		}) => {
			attached.push(stack);
			return () => {};
		},
	}),
);

import { screenSnapshots } from "#lib/components/navigation/stack/screen-snapshots.svelte.ts";
import { snapshotPane } from "#lib/components/navigation/stack/snapshot.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { HISTORY_METADATA_KEY } from "#lib/util/history-index.ts";
import PageStack from "./PageStack.svelte";

function enter({ path, index }: { path: string; index: number }) {
	history.pushState(
		{ [HISTORY_METADATA_KEY]: { historyIndex: index } },
		"",
		path,
	);
}

beforeEach(() => runningOn("windows"));

afterEach(async () => {
	cleanup();
	resetPlatform();
	screenSnapshots.clear();
	attached.length = 0;
	history.replaceState(null, "", "/");
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("PageStack", () => {
	it("offers a swipe over a page cached before it mounted, until the language changes", async () => {
		vi.stubGlobal("navigation", {
			currentEntry: { index: 1 },
			entries: () =>
				["/settings", "/settings/app"].map((path) => ({
					url: `${location.origin}${path}`,
				})),
		});
		enter({ path: "/settings", index: 0 });
		screenSnapshots.navigated({ type: "link" });
		enter({ path: "/settings/app", index: 1 });
		screenSnapshots.remember({
			snapshot: snapshotPane({
				pane: document.createElement("div"),
				path: "/settings",
			}),
			kind: "pane",
		});
		screenSnapshots.navigated({ type: "link" });

		render(PageStack, {
			props: {
				scope: "/settings",
				children: createRawSnippet(() => ({
					render: () => "<div></div>",
				})),
			},
		});
		flushSync();
		const [stack] = attached;
		expect(stack?.offersSwipeBack).toBe(true);

		await setLocale({ locale: "en-XA" });

		expect(stack?.offersSwipeBack).toBe(false);
	});
});
