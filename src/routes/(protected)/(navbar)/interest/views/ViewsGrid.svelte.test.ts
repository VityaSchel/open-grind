// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { ViewGridEntry } from "./views-state.svelte";
import ViewsGrid from "./ViewsGrid.svelte";

const { viewedProfile, fakeViews } = vi.hoisted(() => ({
	viewedProfile: vi.fn(),
	fakeViews: {
		views: [] as ViewGridEntry[],
		loading: false,
		error: null,
		viewedMeHidden: false,
		enablingViewedMe: false,
		refreshing: false,
		refreshFailed: false,
		hasMore: false,
		scrollY: 0,
		load: () => {},
	},
}));

vi.mock("./views-state.svelte", () => ({ getViewsState: () => fakeViews }));
vi.mock("./ViewedProfile.svelte", () => ({ default: viewedProfile }));
vi.mock("./ViewedPreview.svelte", () => ({ default: () => {} }));
vi.mock("./EmptyViewsGrid.svelte", () => ({ default: () => {} }));
vi.mock("./UntrackedViewsGrid.svelte", () => ({ default: () => {} }));
vi.mock("#lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/components/shared/ScrollToTopButton.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/util/scroll-restore.svelte.ts", () => ({
	restoreScrollOnce: () => {},
}));
vi.mock("#lib/util/observe-intersection.ts", () => ({
	observeIntersection: () => ({ destroy: () => {} }),
}));

let columns: HTMLStyleElement;

beforeEach(() => {
	runningOn("linux");
	columns = document.head.appendChild(document.createElement("style"));
	columns.textContent = ".photo-grid { grid-template-columns: 1px 1px 1px; }";
});

afterEach(() => {
	cleanup();
	columns.remove();
	viewedProfile.mockClear();
	fakeViews.hasMore = false;
	resetPlatform();
});

async function mountViews({ count }: { count: number }) {
	fakeViews.views = Array.from({ length: count }, (_, at) => ({
		type: "profile",
		key: `profile-${at}`,
		profile: { profileId: at } as never,
	}));
	render(ViewsGrid, { props: { ourProfileId: 1 } });
	await tick();
	await tick();
	return screen.getByRole("grid", { name: "Views" });
}

describe("the Views grid", () => {
	it("draws each viewer once when it mounts again, in rows of the columns it drew last", async () => {
		await mountViews({ count: 7 });
		cleanup();
		viewedProfile.mockClear();

		const grid = await mountViews({ count: 7 });

		expect(viewedProfile).toHaveBeenCalledTimes(7);
		expect(within(grid).getAllByRole("row")).toHaveLength(3);
	});

	it("leaves the row count open while more viewers can load", async () => {
		fakeViews.hasMore = true;

		const grid = await mountViews({ count: 7 });

		expect(grid.getAttribute("aria-rowcount")).toBe("-1");
	});

	it("lets its rows count themselves once every viewer is loaded", async () => {
		const grid = await mountViews({ count: 7 });

		expect(grid.hasAttribute("aria-rowcount")).toBe(false);
	});
});
