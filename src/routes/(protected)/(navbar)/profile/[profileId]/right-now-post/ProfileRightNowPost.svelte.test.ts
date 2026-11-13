// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	gotoMock,
	getRightNowPostReportMock,
	reportSheetMock,
	openLightboxMock,
	captionMock,
	barActionMock,
	componentSlideMock,
	showErrorToastMock,
	preloadFullImageMock,
	fullImageSizeInTimeMock,
} = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	getRightNowPostReportMock: vi.fn(),
	reportSheetMock: vi.fn(),
	openLightboxMock: vi.fn(),
	captionMock: vi.fn(),
	barActionMock: vi.fn(),
	componentSlideMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	preloadFullImageMock: vi.fn(),
	fullImageSizeInTimeMock: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));
vi.mock("#lib/api/safety/reports.ts", () => ({
	getRightNowPostReport: getRightNowPostReportMock,
}));
vi.mock("#lib/components/report/ReportSheet.svelte", () => ({
	default: reportSheetMock,
}));
vi.mock("#lib/util/photoswipe/index.ts", () => ({
	openLightbox: openLightboxMock,
	applyPhotoSwipeComponent: componentSlideMock,
}));
vi.mock("#lib/util/photoswipe/full-size.ts", () => ({
	preloadFullImage: preloadFullImageMock,
	fullImageSizeInTime: fullImageSizeInTimeMock,
}));
vi.mock("./right-now-viewer.ts", () => ({
	applyPhotoSwipeCaption: captionMock,
	applyPhotoSwipeBarAction: barActionMock,
	closeWhenOpen: (pswp: { close: () => void }) => pswp.close(),
}));

import { rightNowPostSheetRequest } from "#lib/components/right-now/post-sheet-request.ts";
import { proxyMediaUrl } from "#lib/util/media.ts";
import { isPhotoSwipeBusy } from "#lib/util/photoswipe/open-tracking.ts";
import type { ReportTarget } from "#lib/components/report/report-request.ts";
import type {
	RightNowPostDetails,
	RightNowPostDetailsMedia,
} from "#lib/model/right-now/post.ts";
import type { MediaDimensions } from "#lib/util/media-dimensions.ts";
import type { LightboxItem } from "#lib/util/photoswipe/index.ts";
import ProfileRightNowPost from "./ProfileRightNowPost.svelte";

const AUTHOR_ID = 100006;
const POST_ID = 880_000;
const MINUTE = 60_000;
const NAME = "theo";
const FULL_PHOTO = proxyMediaUrl("https://cdns.grindr.com/rightnow/full/2");
const FULL_SIZE = { width: 1200, height: 1600 };

type ViewerPart = {
	render: (mount: {
		target: HTMLElement;
		pswp: { close: () => void };
	}) => Record<string, unknown>;
};

type OpenOptions = {
	items: LightboxItem[];
	animation?: "fade" | "zoom";
	signal: AbortSignal;
	onClosed: () => void;
};

type FakeLightbox = {
	options: Record<string, unknown>;
	on: (name: string, handler: () => void) => void;
	emit: (name: string) => void;
};

const mounted: Record<string, unknown>[] = [];
const lightboxes: FakeLightbox[] = [];

function fakeLightbox(): FakeLightbox {
	const handlers: { name: string; handler: () => void }[] = [];
	const lightbox = {
		options: {},
		on: (name: string, handler: () => void) => {
			handlers.push({ name, handler });
		},
		emit: (name: string) => {
			for (const entry of handlers)
				if (entry.name === name) entry.handler();
		},
	};
	lightboxes.push(lightbox);
	return lightbox;
}

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

function mountViewerPart(mock: typeof captionMock, close: () => void) {
	const [, part] = mock.mock.lastCall as [unknown, ViewerPart];
	const target = document.createElement("div");
	document.body.append(target);
	mounted.push(part.render({ target, pswp: { close } }));
	return target;
}

type SlidePart = {
	render: (mount: {
		target: HTMLElement;
		slide: Record<string, unknown>;
		content: { onLoaded: () => void };
	}) => Record<string, unknown>;
	slideAt: (index: number) => Record<string, unknown> | null;
};

function mountTextSlide() {
	const [, { render: renderSlide, slideAt }] = componentSlideMock.mock
		.lastCall as [unknown, SlidePart];
	const slide = slideAt(0);
	if (slide === null) throw new Error("no text slide");
	const target = document.createElement("div");
	document.body.append(target);
	const content = { onLoaded: vi.fn() };
	mounted.push(renderSlide({ target, slide, content }));
	return { target, content };
}

async function tapCard() {
	const opened = openLightboxMock.mock.calls.length;
	await fireEvent.click(openButton());
	await vi.waitFor(() =>
		expect(openLightboxMock).toHaveBeenCalledTimes(opened + 1),
	);
}

async function openViewer() {
	await tapCard();
	const close = vi.fn();
	return { close, bar: mountViewerPart(barActionMock, close) };
}

function lastOpen() {
	const [options] = openLightboxMock.mock.lastCall as [OpenOptions];
	return options;
}

const openedItems = () => lastOpen().items;

function lastLightbox() {
	const lightbox = lightboxes.at(-1);
	if (lightbox === undefined) throw new Error("no lightbox configured");
	return lightbox;
}

const photoPost = () => post({ media: [media("APPROVED", 2)] });

beforeEach(() => {
	vi.clearAllMocks();
	getRightNowPostReportMock.mockResolvedValue(null);
	fullImageSizeInTimeMock.mockResolvedValue(null);
	openLightboxMock.mockImplementation(
		({ configure }: { configure: (lightbox: unknown) => void }) => {
			configure(fakeLightbox());
			return Promise.resolve();
		},
	);
});

afterEach(() => {
	cleanup();
	for (const component of mounted.splice(0)) void unmount(component);
	lightboxes.length = 0;
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

	it("opens the post full screen with the full-size photo, its text, author and details", async () => {
		const posted = Date.now() - 5 * MINUTE;
		renderCard({ value: post({ posted, media: [media("APPROVED", 2)] }) });

		await openViewer();
		const caption = mountViewerPart(captionMock, vi.fn());

		expect(openedItems()).toMatchObject([{ src: FULL_PHOTO }]);
		expect(componentSlideMock).not.toHaveBeenCalled();
		expect(caption.textContent).toContain("Door's open, come over");
		expect(caption.textContent).toContain(NAME);
		expect(caption.querySelector("time")?.getAttribute("datetime")).toBe(
			new Date(posted).toISOString(),
		);
		expect(
			caption.querySelector('[data-slot="right-now-post-distance"]'),
		).not.toBeNull();
		expect(within(caption).getByText("Hosting")).toBeTruthy();
	});

	it("opens a text-only post as its card centered on a slide that lets taps through around it, with no bottom caption", async () => {
		renderCard();

		await openViewer();
		const { target, content } = mountTextSlide();

		expect(openedItems()).toStrictEqual([{ src: "" }]);
		expect(lastOpen().animation).toBe("fade");
		expect(fullImageSizeInTimeMock).not.toHaveBeenCalled();
		expect(captionMock).not.toHaveBeenCalled();
		const slide = target.querySelector<HTMLElement>(
			'[data-slot="right-now-post-caption-slide"]',
		);
		expect(slide?.textContent).toContain("Door's open, come over");
		expect(slide?.textContent).toContain(NAME);
		expect(target.classList.contains("pointer-events-none")).toBe(true);
		expect(content.onLoaded).toHaveBeenCalledOnce();
	});

	it("opens someone else's blurred photo as the centered text slide, never loading the full-size photo", async () => {
		const flagged = { ...media("APPROVED", 2), shouldBlur: true };
		renderCard({ value: post({ media: [flagged] }) });

		await openViewer();
		const { target } = mountTextSlide();

		expect(openedItems()).toStrictEqual([{ src: "" }]);
		expect(lastOpen().animation).toBe("fade");
		expect(preloadFullImageMock).not.toHaveBeenCalled();
		expect(fullImageSizeInTimeMock).not.toHaveBeenCalled();
		expect(captionMock).not.toHaveBeenCalled();
		const slide = target.querySelector<HTMLElement>(
			'[data-slot="right-now-post-caption-slide"]',
		);
		expect(slide?.textContent).toContain("Door's open, come over");
	});

	it("starts decoding the full-size photo as soon as the card shows", async () => {
		renderCard({ value: photoPost() });
		await tick();

		expect(preloadFullImageMock).toHaveBeenCalledExactlyOnceWith(
			FULL_PHOTO,
		);
		expect(openLightboxMock).not.toHaveBeenCalled();
	});

	it("decodes no full-size photo for a text-only post", async () => {
		renderCard();
		await tick();

		expect(preloadFullImageMock).not.toHaveBeenCalled();
	});

	it("zooms the photo open out of the card's photo frame once its full size is known", async () => {
		fullImageSizeInTimeMock.mockResolvedValue(FULL_SIZE);
		renderCard({ value: photoPost() });

		await tapCard();

		expect(fullImageSizeInTimeMock).toHaveBeenCalledExactlyOnceWith(
			FULL_PHOTO,
		);
		expect(lastOpen().animation).toBe("zoom");
		expect(isPhotoSwipeBusy()).toBe(false);
		expect(openedItems()).toStrictEqual([
			{
				src: FULL_PHOTO,
				...FULL_SIZE,
				element: photoSlot(),
				msrc: FULL_PHOTO,
				thumbCropped: true,
			},
		]);
	});

	it("fades the photo open, unsized, when its full size does not arrive in time", async () => {
		renderCard({ value: photoPost() });

		await tapCard();

		expect(fullImageSizeInTimeMock).toHaveBeenCalledExactlyOnceWith(
			FULL_PHOTO,
		);
		expect(lastOpen().animation).toBe("fade");
		const [item] = openedItems();
		expect(item?.src).toBe(FULL_PHOTO);
		expect(item?.width).toBeUndefined();
		expect(item?.height).toBeUndefined();
		expect(item?.msrc).toBeUndefined();
	});

	it("waits for the photo's full size before opening, holding PhotoSwipe busy meanwhile, and opens nothing once the card has gone away", async () => {
		const size = Promise.withResolvers<MediaDimensions | null>();
		fullImageSizeInTimeMock.mockReturnValue(size.promise);
		const { unmount: unmountCard } = renderCard({ value: photoPost() });

		await fireEvent.click(openButton());
		await vi.waitFor(() =>
			expect(fullImageSizeInTimeMock).toHaveBeenCalledOnce(),
		);
		expect(openLightboxMock).not.toHaveBeenCalled();
		expect(isPhotoSwipeBusy()).toBe(true);
		unmountCard();
		expect(isPhotoSwipeBusy()).toBe(false);
		size.resolve(FULL_SIZE);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(openLightboxMock).not.toHaveBeenCalled();
		expect(isPhotoSwipeBusy()).toBe(false);
	});

	it.each(["openingAnimationStart", "closingAnimationStart"])(
		"hides the card's photo frame from %s until the viewer is gone, so the photo seems to leave and return to it",
		async (animationStart) => {
			fullImageSizeInTimeMock.mockResolvedValue(FULL_SIZE);
			renderCard({ value: photoPost() });
			await tapCard();
			const lightbox = lastLightbox();

			expect(photoSlot().style.visibility).toBe("");
			lightbox.emit(animationStart);
			expect(photoSlot().style.visibility).toBe("hidden");
			lightbox.emit("destroy");

			expect(photoSlot().style.visibility).toBe("");
		},
	);

	it("opens the viewer again after it closes", async () => {
		renderCard();
		await tapCard();

		lastOpen().onClosed();
		await tick();
		await tapCard();

		expect(openLightboxMock).toHaveBeenCalledTimes(2);
	});

	it("closes the viewer when the card goes away", async () => {
		const { unmount: unmountCard } = renderCard();
		await tapCard();
		const { signal } = lastOpen();

		unmountCard();

		expect(signal.aborted).toBe(true);
	});

	it("shows an error when the viewer fails to open and lets the card open it again", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const error = new Error("photoswipe failed to load");
		openLightboxMock.mockRejectedValueOnce(error);
		renderCard();

		await tapCard();
		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label: "Failed to open Right Now post",
				error,
			}),
		);
		await tapCard();

		expect(openLightboxMock).toHaveBeenCalledTimes(2);
	});

	it("shows no error when the viewer fails after the card went away", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const failure = Promise.withResolvers<void>();
		openLightboxMock.mockReturnValueOnce(failure.promise);
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
		const { bar, close } = await openViewer();
		reportSheetMock.mockImplementation(() => {
			focusedAtOpen = document.activeElement;
			closedAtOpen = close.mock.calls.length === 1;
		});
		const reportButton = within(bar).getByRole("button", {
			name: "Report post",
		});
		reportButton.focus();

		await fireEvent.click(reportButton);

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
		expect(
			within(bar).queryByRole("button", { name: "Edit post" }),
		).toBeNull();
	});

	it("keeps the viewer open and focused when the post was already reported", async () => {
		const earlier = Promise.resolve({ createTime: null });
		getRightNowPostReportMock.mockReturnValue(earlier);
		renderCard();
		const { bar, close } = await openViewer();
		const reportButton = within(bar).getByRole("button", {
			name: "Report post",
		});
		reportButton.focus();

		await fireEvent.click(reportButton);
		await earlier;
		await vi.waitFor(() =>
			expect(reportButton.getAttribute("aria-busy")).toBe("false"),
		);

		expect(getRightNowPostReportMock).toHaveBeenCalledOnce();
		expect(close).not.toHaveBeenCalled();
		expect(reportSheetMock).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(reportButton);
	});

	it("offers Edit post instead of Report in the viewer of our own post, closing it and asking Right Now to open the post sheet", async () => {
		renderCard({ own: true });
		const { bar, close } = await openViewer();

		expect(
			within(bar).queryByRole("button", { name: "Report post" }),
		).toBeNull();
		await fireEvent.click(
			within(bar).getByRole("button", { name: "Edit post" }),
		);

		expect(close).toHaveBeenCalledOnce();
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

		await openViewer();

		expect(openedItems()).toMatchObject([{ src: FULL_PHOTO }]);
	});

	it("blurs someone else's photo the server asks to blur", () => {
		const flagged = { ...media("APPROVED"), shouldBlur: true };
		renderCard({ value: post({ media: [flagged] }) });

		expect(
			within(photoSlot()).getByText("May contain nudity"),
		).toBeTruthy();
	});
});
