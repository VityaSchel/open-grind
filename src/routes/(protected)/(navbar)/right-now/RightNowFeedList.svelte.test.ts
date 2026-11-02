// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import type {
	DiscreetPostData,
	PostData,
	RightNowFeedResponseItem,
} from "#lib/model/right-now/feed.ts";
import type {
	RightNowFeedEntry,
	RightNowFeedState,
} from "./right-now-feed-state.svelte";
import RightNowFeedList from "./RightNowFeedList.svelte";

type FeedListState = Pick<
	RightNowFeedState,
	"loading" | "error" | "entries" | "hasMore"
>;

const OUR_PROFILE_ID = 100;
const POSTED = Date.now() - 5 * 60_000;

function postData({ id, text }: { id: number; text: string }): PostData {
	return {
		id,
		profileId: 200 + id,
		displayName: `Author ${id}`,
		text,
		media: [],
		hosting: false,
		posted: POSTED,
		expiration: POSTED + 60 * 60_000,
		recentlyChatted: false,
		favorite: false,
	};
}

function discreetData({
	id,
	text,
}: {
	id: number;
	text: string;
}): DiscreetPostData {
	return {
		id,
		text,
		hosting: false,
		posted: POSTED,
		expiration: POSTED + 60 * 60_000,
		profileFields: {
			age: null,
			height: null,
			weight: null,
			position: null,
		},
	};
}

function stubFeed(items: RightNowFeedResponseItem[]): RightNowFeedState {
	const entries: RightNowFeedEntry[] = items.map((item, index) => ({
		key: `entry-${index}`,
		item,
	}));
	const feed: FeedListState = {
		loading: false,
		error: null,
		entries,
		hasMore: false,
	};
	return feed as unknown as RightNowFeedState;
}

afterEach(cleanup);

describe("the Right Now feed list", () => {
	it("renders standard and locked posts as post cards, and both discreet kinds as anonymous cards", () => {
		render(RightNowFeedList, {
			props: {
				ourProfileId: OUR_PROFILE_ID,
				feed: stubFeed([
					{
						type: "right_now_post_v3",
						data: postData({ id: 1, text: "Standard post" }),
					},
					{
						type: "locked_post_v1",
						data: postData({ id: 2, text: "Locked post" }),
					},
					{
						type: "discreet_right_now_post_v1",
						data: discreetData({
							id: 3,
							text: "Discreet post text",
						}),
					},
					{
						type: "discreet_locked_post_v1",
						data: discreetData({
							id: 4,
							text: "Discreet locked post",
						}),
					},
				]),
			},
		});

		expect(screen.getAllByRole("article")).toHaveLength(4);
		for (const { name, author } of [
			{ name: "Standard post", author: "Author 1" },
			{ name: "Locked post", author: "Author 2" },
		]) {
			const card = screen.getByRole("article", { name });
			expect(card.getAttribute("data-slot")).toBe("right-now-post");
			expect(
				within(card).getByRole("link", { name: `Message ${author}` }),
			).toBeTruthy();
		}
		for (const name of ["Discreet post text", "Discreet locked post"]) {
			const card = screen.getByRole("article", { name });
			expect(card.getAttribute("data-slot")).toBe(
				"right-now-discreet-post",
			);
			expect(within(card).queryAllByRole("link")).toHaveLength(0);
		}
	});
});
