// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { gotoMock, getRightNowPostReportMock, reportSheetMock } = vi.hoisted(
	() => ({
		gotoMock: vi.fn(),
		getRightNowPostReportMock: vi.fn(),
		reportSheetMock: vi.fn(),
	}),
);

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("#lib/api/safety/reports.ts", () => ({
	getRightNowPostReport: getRightNowPostReportMock,
}));
vi.mock("#lib/components/report/ReportSheet.svelte", () => ({
	default: reportSheetMock,
}));
vi.mock("#lib/util/photoswipe/gallery-lightbox.ts", () => ({
	attachGalleryLightbox: () => () => {},
}));

import { rightNowPostSheetRequest } from "#lib/components/right-now/post-sheet-request.svelte.ts";
import { proxyMediaUrl } from "#lib/util/media.ts";
import type { ReportTarget } from "#lib/components/report/report-request.ts";
import type {
	RightNowOwnPostMedia,
	RightNowPostDetails,
} from "#lib/model/right-now/post.ts";
import ProfileRightNowPost from "./ProfileRightNowPost.svelte";

const AUTHOR_ID = 100006;
const POST_ID = 880_000;
const MINUTE = 60_000;

function media(
	state: RightNowOwnPostMedia["state"],
	mediaId = 1,
): RightNowOwnPostMedia {
	return {
		mediaId,
		thumbnailUrl: `https://cdns.grindr.com/rightnow/thumb/${mediaId}`,
		fullImageUrl: `https://cdns.grindr.com/rightnow/full/${mediaId}`,
		isNsfw: false,
		shouldBlur: false,
		state,
		reason: null,
	};
}

function post(
	overrides: Partial<RightNowPostDetails> = {},
): RightNowPostDetails {
	return {
		id: POST_ID,
		profileId: AUTHOR_ID,
		posted: Date.now() - 5 * MINUTE,
		expiration: Date.now() + 55 * MINUTE,
		hosting: true,
		activeText: "Door's open, come over",
		moderatedText: null,
		media: [],
		lat: null,
		lon: null,
		postStatus: "ACTIVE",
		shareLocation: "NONE",
		locationRadius: null,
		...overrides,
	};
}

function renderCard({
	value = post(),
	own = false,
}: { value?: RightNowPostDetails; own?: boolean } = {}) {
	return render(ProfileRightNowPost, { props: { post: value, own } });
}

const card = () => screen.queryByRole("region", { name: "Right Now" });

beforeEach(() => {
	vi.clearAllMocks();
	getRightNowPostReportMock.mockResolvedValue(null);
});

afterEach(() => {
	cleanup();
	rightNowPostSheetRequest.settle();
});

describe("a profile's Right Now post", () => {
	it("shows the post's text, approved photo and posting time", () => {
		const posted = Date.now() - 5 * MINUTE;
		renderCard({
			value: post({
				posted,
				media: [media("PENDING", 1), media("APPROVED", 2)],
			}),
		});

		expect(card()).not.toBeNull();
		expect(screen.getByText("Door's open, come over")).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: "Open photo" })
				.getAttribute("href"),
		).toBe(proxyMediaUrl("https://cdns.grindr.com/rightnow/full/2"));
		expect(card()?.querySelector("time")?.getAttribute("datetime")).toBe(
			new Date(posted).toISOString(),
		);
	});

	it.each([
		["has expired", post({ expiration: Date.now() - MINUTE })],
		[
			"has neither text nor an approved photo",
			post({ activeText: null, media: [media("PENDING")] }),
		],
		["has only blank text", post({ activeText: "   " })],
	])("shows nothing when the post %s", (_, value) => {
		renderCard({ value });

		expect(card()).toBeNull();
	});

	it("reports someone else's post about the post and its author", async () => {
		renderCard();

		await fireEvent.click(
			screen.getByRole("button", { name: "Report post" }),
		);

		expect(getRightNowPostReportMock).toHaveBeenCalledExactlyOnceWith({
			postId: POST_ID,
			profileId: AUTHOR_ID,
		});
		await vi.waitFor(() => expect(reportSheetMock).toHaveBeenCalled());
		const [, props] = reportSheetMock.mock.lastCall as [
			unknown,
			{ open: boolean; target: ReportTarget },
		];
		expect(props.target).toStrictEqual({
			kind: "rightNowPost",
			postId: POST_ID,
			profileId: AUTHOR_ID,
		});
		expect(screen.queryByRole("button", { name: "Edit post" })).toBeNull();
	});

	it("offers Edit post instead of Report on our own post, asking Right Now to open the post sheet", async () => {
		renderCard({ own: true });

		expect(
			screen.queryByRole("button", { name: "Report post" }),
		).toBeNull();
		await fireEvent.click(
			screen.getByRole("button", { name: "Edit post" }),
		);

		expect(rightNowPostSheetRequest.pending).toBe(true);
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith("/right-now");
	});

	it("never blurs our own photo, even one the server flags", () => {
		const flagged = {
			...media("APPROVED"),
			isNsfw: true,
			shouldBlur: true,
		};
		renderCard({ value: post({ media: [flagged] }), own: true });

		expect(screen.getByRole("link", { name: "Open photo" })).toBeTruthy();
		expect(screen.queryByText("May contain nudity")).toBeNull();
	});

	it("blurs someone else's photo the server asks to blur", () => {
		const flagged = { ...media("APPROVED"), shouldBlur: true };
		renderCard({ value: post({ media: [flagged] }) });

		expect(screen.queryByRole("link", { name: "Open photo" })).toBeNull();
		expect(screen.getByText("May contain nudity")).toBeTruthy();
	});
});
