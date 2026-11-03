// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { discreetPostData, postData } from "./feed-post-test-helpers";
import type {
	RightNowFeedPost,
	RightNowFeedState,
} from "./right-now-feed-state.svelte";
import RightNowFeedList from "./RightNowFeedList.svelte";

type FeedListState = Pick<
	RightNowFeedState,
	"loading" | "error" | "entries" | "hasMore"
>;

const OUR_PROFILE_ID = 100;

function stubFeed(items: RightNowFeedPost[]): RightNowFeedState {
	const feed: FeedListState = {
		loading: false,
		error: null,
		entries: items,
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
				ownPostUnderReview: false,
				onedit: vi.fn(),
				feed: stubFeed([
					{
						type: "right_now_post_v3",
						data: postData({
							id: 1,
							profileId: 201,
							displayName: "Author 1",
							text: "Standard post",
						}),
					},
					{
						type: "locked_post_v1",
						data: postData({
							id: 2,
							profileId: 202,
							displayName: "Author 2",
							text: "Locked post",
						}),
					},
					{
						type: "discreet_right_now_post_v1",
						data: discreetPostData({
							id: 3,
							text: "Discreet post text",
						}),
					},
					{
						type: "discreet_locked_post_v1",
						data: discreetPostData({
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

	it("marks our own post as under review and opens the editor from it", async () => {
		const onedit = vi.fn();
		render(RightNowFeedList, {
			props: {
				ourProfileId: OUR_PROFILE_ID,
				ownPostUnderReview: true,
				onedit,
				feed: stubFeed([
					{
						type: "right_now_post_v3",
						data: {
							...postData({ id: 1, text: "Our post" }),
							profileId: OUR_PROFILE_ID,
						},
					},
					{
						type: "right_now_post_v3",
						data: postData({ id: 2, text: "Their post" }),
					},
				]),
			},
		});

		const ours = screen.getByRole("article", { name: "Our post" });
		const theirs = screen.getByRole("article", { name: "Their post" });
		expect(within(ours).getByText("Under review")).toBeTruthy();
		expect(within(theirs).queryByText("Under review")).toBeNull();
		expect(
			within(theirs).queryByRole("button", { name: "Edit your post" }),
		).toBeNull();

		await fireEvent.click(
			within(ours).getByRole("button", { name: "Edit your post" }),
		);

		expect(onedit).toHaveBeenCalledOnce();
	});
});
