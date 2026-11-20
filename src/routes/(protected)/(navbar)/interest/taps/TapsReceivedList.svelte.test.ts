// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { TapProfile } from "#lib/model/interest/tap-profile.ts";

const { fakeTaps } = vi.hoisted(() => ({
	fakeTaps: {
		taps: [] as TapProfile[],
		loading: false,
		error: null,
		refreshing: false,
		refreshFailed: false,
		hasMore: false,
		hasUnseen: false,
		scrollY: 0,
		attachView: () => () => {},
		markViewed: () => {},
		loadMore: () => {},
	},
}));

vi.mock("#lib/interest/taps-state.svelte.ts", () => ({
	getTapsState: () => fakeTaps,
}));
vi.mock("./TapReceivedProfile.svelte", () => ({ default: () => {} }));
vi.mock("./EmptyTapsList.svelte", () => ({ default: () => {} }));
vi.mock("#lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/components/shared/ScrollToTopButton.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/util/scroll-restore.svelte.ts", () => ({
	restoreScrollOnce: () => {},
}));

import TapsReceivedList from "./TapsReceivedList.svelte";

class InertIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

async function mountTaps({
	hasMore,
}: {
	hasMore: boolean;
}): Promise<HTMLElement> {
	fakeTaps.taps = Array.from(
		{ length: 3 },
		(_, at) => ({ profileId: at + 1 }) as TapProfile,
	);
	fakeTaps.hasMore = hasMore;
	render(TapsReceivedList, { props: { ourProfileId: 1, active: true } });
	await tick();
	return screen.getByRole("grid", { name: "Taps" });
}

beforeEach(() => {
	runningOn("linux");
	vi.stubGlobal("IntersectionObserver", InertIntersectionObserver);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	resetPlatform();
});

describe("the Taps grid's row count", () => {
	it("stays open while more taps can load", async () => {
		const grid = await mountTaps({ hasMore: true });

		expect(grid.getAttribute("aria-rowcount")).toBe("-1");
	});

	it("is left to the drawn rows once every tap has loaded", async () => {
		const grid = await mountTaps({ hasMore: false });

		expect(grid.hasAttribute("aria-rowcount")).toBe(false);
	});
});
