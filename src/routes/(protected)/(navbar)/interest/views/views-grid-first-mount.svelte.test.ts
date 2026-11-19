// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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
vi.mock("#lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/components/shared/ScrollToTopButton.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/util/scroll-restore.svelte.ts", () => ({
	restoreScrollOnce: () => {},
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
	resetPlatform();
});

it("draws each viewer once on the first mount of the session, in rows of the columns it measures", async () => {
	fakeViews.views = Array.from({ length: 7 }, (_, at) => ({
		type: "profile",
		key: `profile-${at}`,
		profile: { profileId: at } as never,
	}));

	render(ViewsGrid, { props: { ourProfileId: 1 } });
	await tick();
	await tick();

	expect(viewedProfile).toHaveBeenCalledTimes(7);
	expect(
		within(screen.getByRole("grid", { name: "Views" })).getAllByRole("row"),
	).toHaveLength(3);
});
