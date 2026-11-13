// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reportSheetMock, getRightNowPostReportMock } = vi.hoisted(() => ({
	reportSheetMock: vi.fn(),
	getRightNowPostReportMock:
		vi.fn<
			(target: {
				postId: number;
				profileId: number | null;
			}) => Promise<SubmittedReport | null>
		>(),
}));

vi.mock("#lib/components/report/ReportSheet.svelte", () => ({
	default: reportSheetMock,
}));
vi.mock("#lib/api/safety/reports.ts", () => ({
	getRightNowPostReport: getRightNowPostReportMock,
}));

import {
	defaultRightNowFeedFilters,
	type RightNowFeedFilters,
} from "#lib/model/right-now/filters.ts";
import type { ReportTarget } from "#lib/components/report/report-request.ts";
import type { SubmittedReport } from "#lib/model/safety/reports.ts";
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
	const feed: FeedListState & {
		filters: { current: RightNowFeedFilters; resetFilters: () => void };
	} = {
		loading: false,
		error: null,
		entries: items,
		hasMore: false,
		filters: { current: defaultRightNowFeedFilters, resetFilters: vi.fn() },
	};
	return feed as unknown as RightNowFeedState;
}

const AUTHOR_ID = 201;

const standardPost: RightNowFeedPost = {
	type: "right_now_post_v3",
	data: postData({
		id: 1,
		profileId: AUTHOR_ID,
		displayName: "Author 1",
		text: "Standard post",
	}),
};

const discreetPost: RightNowFeedPost = {
	type: "discreet_right_now_post_v1",
	data: discreetPostData({ id: 3, text: "Discreet post text" }),
};

function renderList({
	items,
	ownPostId = null,
	joinable = true,
}: {
	items: RightNowFeedPost[];
	ownPostId?: number | null;
	joinable?: boolean;
}) {
	return render(RightNowFeedList, {
		props: {
			ourProfileId: OUR_PROFILE_ID,
			ownPostId,
			ownPostUnderReview: false,
			joinable,
			onedit: vi.fn(),
			feed: stubFeed(items),
		},
	});
}

function reportSheetProps() {
	const [, props] = reportSheetMock.mock.lastCall as [
		unknown,
		{ open: boolean; target: ReportTarget },
	];
	return props;
}

const reportButtonOf = (name: string) =>
	within(screen.getByRole("article", { name })).getByRole("button", {
		name: "Report post",
	});

beforeEach(() => {
	vi.clearAllMocks();
	getRightNowPostReportMock.mockResolvedValue(null);
});

afterEach(cleanup);

describe("the Right Now feed list", () => {
	it("renders standard and locked posts as post cards, and both discreet kinds as anonymous cards", () => {
		render(RightNowFeedList, {
			props: {
				ourProfileId: OUR_PROFILE_ID,
				ownPostId: null,
				ownPostUnderReview: false,
				joinable: true,
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
		for (const name of ["Standard post", "Locked post"]) {
			const card = screen.getByRole("article", { name });
			expect(card.getAttribute("data-slot")).toBe("right-now-post");
		}
		for (const name of ["Discreet post text", "Discreet locked post"]) {
			const card = screen.getByRole("article", { name });
			expect(card.getAttribute("data-slot")).toBe(
				"right-now-discreet-post",
			);
		}
	});

	it("marks our own post as under review and opens the editor from it", async () => {
		const onedit = vi.fn();
		render(RightNowFeedList, {
			props: {
				ourProfileId: OUR_PROFILE_ID,
				ownPostId: 1,
				ownPostUnderReview: true,
				joinable: false,
				onedit,
				feed: stubFeed([
					{
						type: "right_now_post_v3",
						data: {
							...postData({ id: 1, text: "Our post" }),
							profileId: OUR_PROFILE_ID,
						},
					},
				]),
			},
		});

		const ours = screen.getByRole("article", { name: "Our post" });
		expect(within(ours).getByText("Under review")).toBeTruthy();

		await fireEvent.click(
			within(ours).getByRole("button", { name: "Edit your post" }),
		);

		expect(onedit).toHaveBeenCalledOnce();
	});

	it.each([
		{
			ownPostId: 5,
			joinable: false,
			description: "No one else nearby is on Right Now.",
		},
		{
			ownPostId: null,
			joinable: true,
			description: "No one nearby is on Right Now. Join to be the first.",
		},
		{
			ownPostId: null,
			joinable: false,
			description: "No one nearby is on Right Now.",
		},
	])(
		"tells the empty state whether our post runs and whether we can join: $description",
		({ ownPostId, joinable, description }) => {
			renderList({ items: [], ownPostId, joinable });

			expect(screen.getByText(description)).toBeTruthy();
		},
	);
});

describe("the Right Now feed list's room for the Join pill", () => {
	const clearance = (container: HTMLElement) =>
		container.querySelector('[data-slot="right-now-join-clearance"]');

	it("sits under the posts", () => {
		const { container } = renderList({ items: [standardPost] });

		expect(clearance(container)).not.toBeNull();
	});

	it("is left out of the empty state so it stays centered", () => {
		const { container } = renderList({ items: [] });

		expect(clearance(container)).toBeNull();
	});
});

describe("reporting from the Right Now feed list", () => {
	it("opens a report about a known author's post once no earlier report turns up", async () => {
		renderList({ items: [standardPost, discreetPost] });

		await fireEvent.click(reportButtonOf("Standard post"));

		expect(getRightNowPostReportMock).toHaveBeenCalledExactlyOnceWith({
			postId: 1,
			profileId: AUTHOR_ID,
		});
		await vi.waitFor(() => expect(reportSheetMock).toHaveBeenCalled());
		expect(reportSheetProps().open).toBe(true);
		expect(reportSheetProps().target).toStrictEqual({
			kind: "rightNowPost",
			postId: 1,
			profileId: AUTHOR_ID,
		});
	});

	it("opens a report about an anonymous post without an author", async () => {
		renderList({ items: [standardPost, discreetPost] });

		await fireEvent.click(reportButtonOf("Discreet post text"));

		expect(getRightNowPostReportMock).toHaveBeenCalledExactlyOnceWith({
			postId: 3,
			profileId: null,
		});
		await vi.waitFor(() => expect(reportSheetMock).toHaveBeenCalled());
		expect(reportSheetProps().target).toStrictEqual({
			kind: "rightNowPost",
			postId: 3,
			profileId: null,
		});
	});

	it("offers no report on our own discreet post", () => {
		renderList({ items: [discreetPost], ownPostId: 3 });

		expect(
			within(
				screen.getByRole("article", { name: "Discreet post text" }),
			).queryByRole("button", { name: "Report post" }),
		).toBeNull();
	});
});
