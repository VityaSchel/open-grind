// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { scrollToTop } = vi.hoisted(() => ({
	scrollToTop: {
		props: null as { text?: string; onjump?: () => void } | null,
	},
}));

class FakeFeedState {
	hasNewPosts = $state(false);
	loading = false;
	refreshing = false;
	error = null;
	entries = $state.raw<unknown[]>([]);
	filters = {};
	scrollY = 0;
	refresh = vi.fn(() => Promise.resolve());
	followScroll = vi.fn();
	attachView = () => () => {};
	followLocation = () => {};
	onStartOver = () => () => {};
}

const fakeOwnPost = {
	post: null,
	loading: false,
	pendingModeration: false,
	status: "none",
	freePostsLeft: 1,
	followLocation: () => {},
};

let fakeFeed = new FakeFeedState();

vi.mock("./right-now-feed-state.svelte", () => ({
	getRightNowFeedState: () => fakeFeed,
}));
vi.mock("./right-now-post-state.svelte", () => ({
	getRightNowPostState: () => fakeOwnPost,
}));
vi.mock("#lib/components/shared/ScrollToTopButton.svelte", () => ({
	default: (_anchor: unknown, props: typeof scrollToTop.props) => {
		scrollToTop.props = props;
	},
}));
vi.mock("#lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/components/filters/QuickFiltersBar.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/components/location-chooser/LocationChange.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/util/scroll-restore.svelte.ts", () => ({
	restoreScrollOnce: () => {},
}));
vi.mock("./top-bar/QuickFilters.svelte", () => ({ default: () => {} }));
vi.mock("./RightNowFeedList.svelte", () => ({ default: () => {} }));
vi.mock("./post/RightNowPostControls.svelte", () => ({ default: () => {} }));

import RightNowFeedScreen from "./RightNowFeedScreen.svelte";

function mountScreen() {
	return render(RightNowFeedScreen, {
		props: { ourProfileId: 1, geohash: "u33dbc" },
	});
}

function mountedScroller() {
	const { container } = mountScreen();
	const scroller = container.querySelector<HTMLElement>(
		'[data-slot="right-now-scroller"]',
	);
	if (!scroller) throw new Error("the feed scroller did not mount");
	return scroller;
}

function mountedScrollToTop() {
	mountScreen();
	if (!scrollToTop.props)
		throw new Error("the scroll-to-top button did not mount");
	return scrollToTop.props;
}

beforeEach(() => {
	fakeFeed = new FakeFeedState();
});

afterEach(() => {
	cleanup();
	scrollToTop.props = null;
});

describe("the Right Now feed screen", () => {
	it("leaves the scroll-to-top button plain while no new posts are held back", () => {
		const button = mountedScrollToTop();

		expect(button.text).toBeUndefined();
		expect(button.onjump).toBeUndefined();
	});

	it("labels the scroll-to-top button New posts while posts are held back and refreshes on its tap", () => {
		const button = mountedScrollToTop();

		fakeFeed.hasNewPosts = true;
		flushSync();

		expect(button.text).toBe("New posts");

		button.onjump?.();

		expect(fakeFeed.refresh).toHaveBeenCalledOnce();
	});

	it("tells the feed how far the list is scrolled", () => {
		const scroller = mountedScroller();

		scroller.scrollTop = 400;
		scroller.dispatchEvent(new Event("scroll"));

		expect(fakeFeed.followScroll).toHaveBeenCalledExactlyOnceWith(400);
	});

	it.each([
		{
			list: "a list a few px from the top to the very top",
			from: 12,
			to: 0,
		},
		{
			list: "a list scrolled further down where it is",
			from: 400,
			to: 400,
		},
	])(
		"moves $list before new posts go in, so posts swapped in at the top are not pushed out of view above it",
		({ from, to }) => {
			const scroller = mountedScroller();
			scroller.scrollTop = from;

			fakeFeed.entries = [{}];
			flushSync();

			expect(scroller.scrollTop).toBe(to);
		},
	);
});
