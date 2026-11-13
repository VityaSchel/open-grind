// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { openRightNowPostViewer } from "./right-now-viewer.ts";

const {
	gotoMock,
	page,
	getRightNowPostReportMock,
	reportSheetMock,
	openViewerMock,
	showErrorToastMock,
	preloadFullImageMock,
} = vi.hoisted(() => ({
	gotoMock: vi.fn<(path: string) => Promise<void>>(),
	page: { url: new URL("http://localhost/profile/100006") },
	getRightNowPostReportMock: vi.fn(),
	reportSheetMock: vi.fn(),
	openViewerMock: vi.fn<typeof openRightNowPostViewer>(),
	showErrorToastMock: vi.fn(),
	preloadFullImageMock: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("$app/state", () => ({ page }));
vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));
vi.mock("#lib/api/safety/reports.ts", () => ({
	getRightNowPostReport: getRightNowPostReportMock,
}));
vi.mock("#lib/components/report/ReportSheet.svelte", () => ({
	default: reportSheetMock,
}));
vi.mock("#lib/util/photoswipe/full-size.ts", () => ({
	preloadFullImage: preloadFullImageMock,
}));
vi.mock("./right-now-viewer.ts", () => ({
	openRightNowPostViewer: openViewerMock,
}));

import { rightNowPostSheetRequest } from "#lib/components/right-now/post-sheet-request-state.svelte.ts";
import { proxyMediaUrl } from "#lib/util/media.ts";
import type { ReportTarget } from "#lib/components/report/report-request.ts";
import type {
	RightNowPostDetails,
	RightNowPostDetailsMedia,
} from "#lib/model/right-now/post.ts";
import ProfileRightNowPost from "./ProfileRightNowPost.svelte";

const AUTHOR_ID = 100006;
const POST_ID = 880_000;
const MINUTE = 60_000;
const NAME = "theo";
const FULL_PHOTO = proxyMediaUrl("https://cdns.grindr.com/rightnow/full/2");

function media(
	state: RightNowPostDetailsMedia["state"],
	mediaId = 1,
): RightNowPostDetailsMedia {
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
	return render(ProfileRightNowPost, {
		props: {
			post: value,
			own,
			displayName: NAME,
			onlineUntil: null,
			distance: 650,
		},
	});
}

const card = () => screen.queryByRole("region", { name: "Right Now" });
const openButton = () => screen.getByRole("button", { name: "Right Now" });

function photoSlot() {
	const slot = card()?.querySelector<HTMLElement>(
		'[data-slot="profile-right-now-post-photo"]',
	);
	if (!slot) throw new Error("no post photo");
	return slot;
}

async function tapCard() {
	const opened = openViewerMock.mock.calls.length;
	await fireEvent.click(openButton());
	await vi.waitFor(() =>
		expect(openViewerMock).toHaveBeenCalledTimes(opened + 1),
	);
	const [options] = openViewerMock.mock.lastCall!;
	return options;
}

function focusOutsideCard() {
	const button = document.createElement("button");
	document.body.append(button);
	button.focus();
	return button;
}

beforeEach(() => {
	vi.resetAllMocks();
	getRightNowPostReportMock.mockResolvedValue(null);
	page.url = new URL("http://localhost/profile/100006");
	gotoMock.mockImplementation((path) => {
		page.url = new URL(path, page.url);
		return Promise.resolve();
	});
	openViewerMock.mockResolvedValue();
});

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
	rightNowPostSheetRequest.take();
	vi.restoreAllMocks();
});

describe("a profile's Right Now post", () => {
	it("shows the post's text, approved photo and posting time as one button with no actions of its own", () => {
		const posted = Date.now() - 5 * MINUTE;
		renderCard({
			value: post({
				posted,
				media: [media("PENDING", 1), media("APPROVED", 2)],
			}),
		});

		expect(screen.getByText("Door's open, come over")).toBeTruthy();
		expect(screen.getByRole("img", { name: "Post photo" })).toBeTruthy();
		expect(preloadFullImageMock).toHaveBeenCalledExactlyOnceWith(
			FULL_PHOTO,
		);
		expect(card()?.querySelector("time")?.getAttribute("datetime")).toBe(
			new Date(posted).toISOString(),
		);
		expect(
			within(card() as HTMLElement)
				.getAllByRole("button")
				.map((button) => button.textContent?.trim()),
		).toStrictEqual(["Right Now"]);
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

	it("opens the viewer on the full-size photo out of the card's photo frame, captioned with the post's text, author and details", async () => {
		const posted = Date.now() - 5 * MINUTE;
		renderCard({ value: post({ posted, media: [media("APPROVED", 2)] }) });

		const options = await tapCard();

		expect(options).toMatchObject({
			src: FULL_PHOTO,
			frame: photoSlot(),
			own: false,
		});
		expect(options.caption).toStrictEqual({
			text: "Door's open, come over",
			displayName: NAME,
			onlineUntil: null,
			posted,
			distance: 650,
			hosting: true,
		});
	});

	it("opens a text-only post in the viewer with no photo to show or zoom from", async () => {
		renderCard();

		const options = await tapCard();

		expect(options).toMatchObject({ src: null, frame: null });
		expect(options.caption.text).toBe("Door's open, come over");
	});

	it("opens someone else's blurred photo in the viewer as its text alone, never loading the full-size photo", async () => {
		const flagged = { ...media("APPROVED", 2), shouldBlur: true };
		renderCard({ value: post({ media: [flagged] }) });

		const options = await tapCard();

		expect(options).toMatchObject({ src: null, frame: photoSlot() });
		expect(options.caption.text).toBe("Door's open, come over");
		expect(preloadFullImageMock).not.toHaveBeenCalled();
	});

	it("starts decoding the full-size photo as soon as the card shows", async () => {
		renderCard({ value: post({ media: [media("APPROVED", 2)] }) });
		await tick();

		expect(preloadFullImageMock).toHaveBeenCalledExactlyOnceWith(
			FULL_PHOTO,
		);
		expect(openViewerMock).not.toHaveBeenCalled();
	});

	it("decodes no full-size photo for a text-only post", async () => {
		renderCard();
		await tick();

		expect(preloadFullImageMock).not.toHaveBeenCalled();
	});

	it("opens the viewer again after it closes", async () => {
		renderCard();
		const { onClosed } = await tapCard();

		onClosed();
		await tick();
		await tapCard();

		expect(openViewerMock).toHaveBeenCalledTimes(2);
	});

	it("closes the viewer when the card goes away", async () => {
		const { unmount: unmountCard } = renderCard();
		const { signal } = await tapCard();
		expect(signal.aborted).toBe(false);

		unmountCard();

		expect(signal.aborted).toBe(true);
	});

	it("shows an error when the viewer fails to open and lets the card open it again", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const error = new Error("photoswipe failed to load");
		openViewerMock.mockRejectedValueOnce(error);
		renderCard();

		await tapCard();
		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label: "Failed to open Right Now post",
				error,
			}),
		);
		await tapCard();

		expect(openViewerMock).toHaveBeenCalledTimes(2);
	});

	it("shows no error when the viewer fails after the card went away", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const failure = Promise.withResolvers<void>();
		openViewerMock.mockReturnValueOnce(failure.promise);
		const { unmount: unmountCard } = renderCard();
		await tapCard();

		unmountCard();
		failure.reject(new Error("aborted"));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("reports someone else's post from the viewer, closing it and returning focus to the card as the report sheet opens", async () => {
		let focusedAtOpen: Element | null = null;
		let closedAtOpen = false;
		renderCard();
		const { onreport } = await tapCard();
		const closeViewer = vi.fn();
		reportSheetMock.mockImplementationOnce(() => {
			focusedAtOpen = document.activeElement;
			closedAtOpen = closeViewer.mock.calls.length === 1;
		});
		focusOutsideCard();

		await onreport({ closeViewer });

		expect(getRightNowPostReportMock).toHaveBeenCalledExactlyOnceWith({
			postId: POST_ID,
			profileId: AUTHOR_ID,
		});
		await vi.waitFor(() => expect(reportSheetMock).toHaveBeenCalled());
		expect(closedAtOpen).toBe(true);
		expect(focusedAtOpen).toBe(openButton());
		const [, props] = reportSheetMock.mock.lastCall as [
			unknown,
			{ open: boolean; target: ReportTarget },
		];
		expect(props.target).toStrictEqual({
			kind: "rightNowPost",
			postId: POST_ID,
			profileId: AUTHOR_ID,
		});
	});

	it("keeps the viewer open and focused when the post was already reported", async () => {
		getRightNowPostReportMock.mockResolvedValueOnce({ createTime: null });
		renderCard();
		const { onreport } = await tapCard();
		const closeViewer = vi.fn();
		const reportButton = focusOutsideCard();

		await onreport({ closeViewer });

		expect(getRightNowPostReportMock).toHaveBeenCalledOnce();
		expect(closeViewer).not.toHaveBeenCalled();
		expect(reportSheetMock).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(reportButton);
	});

	it("offers Edit post in the viewer of our own post, asking Right Now to open the post sheet", async () => {
		renderCard({ own: true });
		const { own, onedit } = await tapCard();

		expect(own).toBe(true);
		onedit();

		expect(rightNowPostSheetRequest.take()).toBe(true);
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith("/right-now");
	});

	it("never blurs our own photo, even one the server flags, and opens it full size", async () => {
		const flagged = {
			...media("APPROVED", 2),
			isNsfw: true,
			shouldBlur: true,
		};
		renderCard({ value: post({ media: [flagged] }), own: true });

		expect(
			within(photoSlot()).getByRole("img", { name: "Post photo" }),
		).toBeTruthy();
		expect(screen.queryByText("May contain nudity")).toBeNull();

		expect(preloadFullImageMock).toHaveBeenCalledExactlyOnceWith(
			FULL_PHOTO,
		);

		const options = await tapCard();

		expect(options.src).toBe(FULL_PHOTO);
	});

	it("blurs someone else's photo the server asks to blur", () => {
		const flagged = { ...media("APPROVED"), shouldBlur: true };
		renderCard({ value: post({ media: [flagged] }) });

		expect(
			within(photoSlot()).getByText("May contain nudity"),
		).toBeTruthy();
	});
});
