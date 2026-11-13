// @vitest-environment jsdom

import { fireEvent, within } from "@testing-library/svelte";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import { unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type PhotoSwipe from "photoswipe";
import type { PhotoSwipeEventsMap } from "photoswipe";

import type { fullImageSizeInTime } from "#lib/util/photoswipe/full-size.ts";
import type {
	applyPhotoSwipeComponent,
	openLightbox,
} from "#lib/util/photoswipe/index.ts";

const { openLightboxMock, componentSlideMock, fullImageSizeInTimeMock } =
	vi.hoisted(() => ({
		openLightboxMock: vi.fn<typeof openLightbox>(),
		componentSlideMock: vi.fn<typeof applyPhotoSwipeComponent>(),
		fullImageSizeInTimeMock: vi.fn<typeof fullImageSizeInTime>(),
	}));

vi.mock("#lib/util/photoswipe/index.ts", () => ({
	openLightbox: openLightboxMock,
	applyPhotoSwipeComponent: componentSlideMock,
}));
vi.mock("#lib/util/photoswipe/full-size.ts", () => ({
	fullImageSizeInTime: fullImageSizeInTimeMock,
}));

import { isPhotoSwipeBusy } from "#lib/util/photoswipe/open-tracking.ts";
import type { MediaDimensions } from "#lib/util/media-dimensions.ts";
import {
	applyPhotoSwipeBarAction,
	applyPhotoSwipeCaption,
	closeWhenOpen,
	openRightNowPostViewer,
} from "./right-now-viewer";

type Actions = Parameters<typeof applyPhotoSwipeBarAction>[1];

const POST_TEXT = "Gym's done, now what?";
const NAME = "theo";
const POSTED = Date.UTC(2026, 10, 13, 9, 30);
const PHOTO = "https://example.invalid/right-now-full.jpg";
const FULL_SIZE = { width: 1200, height: 1600 };
const CAPTION = {
	text: POST_TEXT,
	displayName: NAME,
	onlineUntil: null,
	posted: POSTED,
	distance: 650,
	hosting: true,
};
const teardowns: (() => void)[] = [];
const mounted: Record<string, unknown>[] = [];

beforeEach(() => {
	vi.resetAllMocks();
	openLightboxMock.mockResolvedValue();
	fullImageSizeInTimeMock.mockResolvedValue(null);
});

afterEach(async () => {
	for (const teardown of teardowns.splice(0)) teardown();
	for (const component of mounted.splice(0)) void unmount(component);
	await vi.waitFor(() => expect(window.pswp).toBeUndefined());
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

function viewer({ animation = "none" }: { animation?: "none" | "fade" } = {}) {
	const lightbox = new PhotoSwipeLightbox({
		dataSource: [
			{
				src: "https://example.invalid/right-now.jpg",
				width: 600,
				height: 800,
			},
		],
		pswpModule: () => import("photoswipe"),
		showHideAnimationType: animation,
	});
	teardowns.push(() => lightbox.destroy());
	return lightbox;
}

async function open(lightbox: PhotoSwipeLightbox) {
	lightbox.init();
	lightbox.loadAndOpen(0);
	await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));
	return lightbox.pswp!;
}

async function close(lightbox: PhotoSwipeLightbox) {
	lightbox.pswp?.close();
	await vi.waitFor(() => expect(lightbox.pswp).toBeUndefined());
}

function captionPanelOf(pswp: PhotoSwipe) {
	return pswp.element!.querySelector<HTMLElement>(".pswp__caption-panel");
}

function topBarOf(pswp: PhotoSwipe) {
	return pswp.element!.querySelector<HTMLElement>(".pswp__top-bar")!;
}

function viewerActions({ own = false }: { own?: boolean } = {}) {
	return {
		own,
		onreport: vi.fn<Actions["onreport"]>(() => Promise.resolve()),
		onedit: vi.fn<Actions["onedit"]>(),
	};
}

describe("applyPhotoSwipeCaption", () => {
	it("mounts the post's text, author and details in a panel on the viewer and unmounts them when the viewer closes", async () => {
		const lightbox = viewer();
		applyPhotoSwipeCaption(lightbox, { caption: CAPTION });

		const pswp = await open(lightbox);
		const panel = captionPanelOf(pswp)!;

		expect(panel.parentElement).toBe(pswp.element);
		expect(within(panel).getByText(POST_TEXT)).toBeTruthy();
		expect(panel.textContent).toContain(NAME);
		expect(panel.querySelector("time")?.getAttribute("datetime")).toBe(
			new Date(POSTED).toISOString(),
		);
		expect(
			panel.querySelector('[data-slot="right-now-post-distance"]'),
		).not.toBeNull();
		expect(within(panel).getByText("Hosting")).toBeTruthy();

		await close(lightbox);

		expect(within(panel).queryByText(POST_TEXT)).toBeNull();
	});

	it("reserves the caption height below the photo while the viewer is open", async () => {
		const lightbox = viewer();
		lightbox.options.paddingFn = () => ({
			top: 0,
			right: 0,
			bottom: 10,
			left: 0,
		});
		applyPhotoSwipeCaption(lightbox, { caption: CAPTION });
		const padding = () =>
			lightbox.options.paddingFn!({ x: 400, y: 800 }, {}, 0);

		const pswp = await open(lightbox);
		captionPanelOf(pswp)!.getBoundingClientRect = () =>
			new DOMRect(0, 720, 400, 80);

		expect(padding()).toEqual({ top: 0, right: 0, bottom: 90, left: 0 });

		await close(lightbox);

		expect(padding().bottom).toBe(10);
	});

	it("relays out the viewer when the caption resizes and stops watching it on close", async () => {
		const observers: FakeResizeObserver[] = [];
		class FakeResizeObserver {
			readonly callback: () => void;
			readonly disconnect = vi.fn();
			readonly observed: Element[] = [];

			constructor(callback: () => void) {
				this.callback = callback;
				observers.push(this);
			}

			observe(element: Element) {
				this.observed.push(element);
			}

			unobserve() {}
		}
		vi.stubGlobal("ResizeObserver", FakeResizeObserver);
		const lightbox = viewer();
		applyPhotoSwipeCaption(lightbox, { caption: CAPTION });

		const pswp = await open(lightbox);
		const updateSize = vi.spyOn(pswp, "updateSize");
		const [observer] = observers;

		expect(observers).toHaveLength(1);
		expect(observer).toMatchObject({ observed: [captionPanelOf(pswp)] });

		observer!.callback();

		expect(updateSize).toHaveBeenCalledExactlyOnceWith(true);

		await close(lightbox);

		expect(observer!.disconnect).toHaveBeenCalled();
	});
});

describe("applyPhotoSwipeBarAction", () => {
	it("puts its action in the top bar right before the close button and unmounts it on destroy", async () => {
		const lightbox = viewer();
		applyPhotoSwipeBarAction(lightbox, viewerActions({ own: true }));

		const pswp = await open(lightbox);
		const bar = topBarOf(pswp);
		const action = bar.querySelector<HTMLElement>(".pswp__bar-action")!;

		expect(
			within(action).getByRole("button", { name: "Edit post" }),
		).toBeTruthy();
		expect(action.nextElementSibling).toBe(
			within(bar).getByRole("button", { name: "Close" }),
		);

		pswp.destroy();
		await vi.waitFor(() => expect(lightbox.pswp).toBeUndefined());

		expect(
			within(action).queryByRole("button", { name: "Edit post" }),
		).toBeNull();
	});

	it("offers our own post Edit post instead of Report, closing the viewer and editing once", async () => {
		const lightbox = viewer();
		const actions = viewerActions({ own: true });
		applyPhotoSwipeBarAction(lightbox, actions);
		const bar = topBarOf(await open(lightbox));

		expect(
			within(bar).queryByRole("button", { name: "Report post" }),
		).toBeNull();
		await fireEvent.click(
			within(bar).getByRole("button", { name: "Edit post" }),
		);

		expect(actions.onedit).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(lightbox.pswp).toBeUndefined());
	});

	it("offers someone else's post Report post instead of Edit, reporting once with a way to close the viewer", async () => {
		const lightbox = viewer();
		const actions = viewerActions();
		applyPhotoSwipeBarAction(lightbox, actions);
		const bar = topBarOf(await open(lightbox));

		expect(
			within(bar).queryByRole("button", { name: "Edit post" }),
		).toBeNull();
		await fireEvent.click(
			within(bar).getByRole("button", { name: "Report post" }),
		);

		expect(actions.onreport).toHaveBeenCalledOnce();
		expect(lightbox.pswp?.opener.isOpen).toBe(true);
		const [{ closeViewer }] = actions.onreport.mock.lastCall!;
		closeViewer();
		await vi.waitFor(() => expect(lightbox.pswp).toBeUndefined());
	});

	it("keeps the viewer open with Report post focused and no longer busy when reporting ends without closing it", async () => {
		const check = Promise.withResolvers<void>();
		const lightbox = viewer();
		const actions = viewerActions();
		actions.onreport.mockReturnValueOnce(check.promise);
		applyPhotoSwipeBarAction(lightbox, actions);
		const bar = topBarOf(await open(lightbox));
		const reportButton = within(bar).getByRole("button", {
			name: "Report post",
		});
		reportButton.focus();

		await fireEvent.click(reportButton);
		expect(reportButton.getAttribute("aria-busy")).toBe("true");
		check.resolve();
		await vi.waitFor(() =>
			expect(reportButton.getAttribute("aria-busy")).toBe("false"),
		);

		expect(lightbox.pswp?.opener.isOpen).toBe(true);
		expect(document.activeElement).toBe(reportButton);
	});
});

describe("closeWhenOpen", () => {
	it("closes an open viewer right away", async () => {
		const lightbox = viewer();
		const pswp = await open(lightbox);

		closeWhenOpen(pswp);

		await vi.waitFor(() => expect(lightbox.pswp).toBeUndefined());
	});

	it("closes a viewer that is still opening once it has opened", async () => {
		const lightbox = viewer({ animation: "fade" });
		lightbox.init();
		lightbox.loadAndOpen(0);
		await vi.waitFor(() => expect(lightbox.pswp).toBeDefined());
		const pswp = lightbox.pswp!;
		expect(pswp.opener.isOpen).toBe(false);

		closeWhenOpen(pswp);

		await vi.waitFor(() => expect(lightbox.pswp).toBeUndefined(), {
			timeout: 5000,
		});
	});
});

describe("openRightNowPostViewer", () => {
	function openPost(
		overrides: Partial<Parameters<typeof openRightNowPostViewer>[0]> = {},
	) {
		return openRightNowPostViewer({
			src: PHOTO,
			frame: null,
			caption: CAPTION,
			...viewerActions(),
			signal: new AbortController().signal,
			onClosed: vi.fn(),
			...overrides,
		});
	}

	function lastOpen() {
		const call = openLightboxMock.mock.lastCall;
		if (call === undefined) throw new Error("no viewer opened");
		return call[0];
	}

	function configured(lightbox: PhotoSwipeLightbox) {
		lastOpen().configure?.(lightbox);
		return lightbox;
	}

	function mountTextSlide() {
		configured(new PhotoSwipeLightbox({}));
		const [, { slideAt, render }] = componentSlideMock.mock.lastCall!;
		const target = document.createElement("div");
		document.body.append(target);
		const content = { onLoaded: vi.fn() };
		mounted.push(
			render({
				target,
				slide: slideAt(0),
				content:
					content as unknown as PhotoSwipeEventsMap["contentLoad"]["content"],
			}),
		);
		return { target, content };
	}

	it("zooms a photo open out of its frame once its full size is known", async () => {
		fullImageSizeInTimeMock.mockResolvedValueOnce(FULL_SIZE);
		const frame = document.createElement("div");
		const signal = new AbortController().signal;
		const onClosed = vi.fn();

		await openPost({ frame, signal, onClosed });

		expect(fullImageSizeInTimeMock).toHaveBeenCalledExactlyOnceWith(PHOTO);
		expect(lastOpen()).toStrictEqual({
			items: [
				{
					src: PHOTO,
					...FULL_SIZE,
					element: frame,
					msrc: PHOTO,
					thumbCropped: true,
				},
			],
			animation: "zoom",
			configure: expect.any(Function),
			signal,
			onClosed,
		});
	});

	it("fades a photo open, unsized, when its full size does not arrive in time", async () => {
		const frame = document.createElement("div");

		await openPost({ frame });

		expect(lastOpen().animation).toBe("fade");
		expect(lastOpen().items).toStrictEqual([
			{ src: PHOTO, element: frame, msrc: undefined, thumbCropped: true },
		]);
	});

	it.each([
		["a text-only post", null],
		["someone else's blurred photo", document.createElement("div")],
	])(
		"opens %s as its caption centered on a slide that lets taps through around it, faded in with no full-size wait",
		async (_, frame) => {
			await openPost({ src: null, frame });
			const { target, content } = mountTextSlide();

			expect(fullImageSizeInTimeMock).not.toHaveBeenCalled();
			expect(lastOpen().items).toStrictEqual([{ src: "" }]);
			expect(lastOpen().animation).toBe("fade");
			const slide = target.querySelector<HTMLElement>(
				'[data-slot="right-now-post-caption-slide"]',
			);
			expect(slide?.textContent).toContain(POST_TEXT);
			expect(slide?.textContent).toContain(NAME);
			expect(target.classList.contains("pointer-events-none")).toBe(true);
			expect(content.onLoaded).toHaveBeenCalledOnce();
		},
	);

	it.each(["openingAnimationStart", "closingAnimationStart"] as const)(
		"hides the photo's frame from %s until the viewer is gone, so the photo seems to leave and return to it",
		async (animationStart) => {
			const frame = document.createElement("div");
			await openPost({ frame });
			const lightbox = configured(new PhotoSwipeLightbox({}));

			expect(frame.style.visibility).toBe("");
			lightbox.dispatch(animationStart);
			expect(frame.style.visibility).toBe("hidden");
			lightbox.dispatch("destroy");

			expect(frame.style.visibility).toBe("");
		},
	);

	it("leaves a blurred photo's frame in place, as no photo leaves it", async () => {
		const frame = document.createElement("div");
		await openPost({ src: null, frame });
		const lightbox = configured(new PhotoSwipeLightbox({}));

		lightbox.dispatch("openingAnimationStart");

		expect(frame.style.visibility).toBe("");
	});

	it("puts the post's caption below the photo and its action in the top bar of a black viewer", async () => {
		const actions = viewerActions();
		await openPost(actions);
		const lightbox = configured(viewer());

		const pswp = await open(lightbox);
		await fireEvent.click(
			within(topBarOf(pswp)).getByRole("button", { name: "Report post" }),
		);

		expect(lightbox.options.bgOpacity).toBe(1);
		expect(componentSlideMock).not.toHaveBeenCalled();
		expect(within(captionPanelOf(pswp)!).getByText(POST_TEXT)).toBeTruthy();
		expect(actions.onreport).toHaveBeenCalledOnce();
	});

	it("gives the text slide no bottom caption, only the post's action in the top bar", async () => {
		const actions = viewerActions({ own: true });
		await openPost({ src: null, ...actions });
		const lightbox = configured(viewer());

		const pswp = await open(lightbox);
		await fireEvent.click(
			within(topBarOf(pswp)).getByRole("button", { name: "Edit post" }),
		);

		expect(captionPanelOf(pswp)).toBeNull();
		expect(actions.onedit).toHaveBeenCalledOnce();
	});

	it("holds PhotoSwipe busy through the full-size wait and lets go right as the viewer starts opening", async () => {
		const size = Promise.withResolvers<MediaDimensions | null>();
		fullImageSizeInTimeMock.mockReturnValueOnce(size.promise);
		let busyAtOpen = false;
		openLightboxMock.mockImplementationOnce(() => {
			busyAtOpen = isPhotoSwipeBusy();
			return new Promise(() => {});
		});

		void openPost();
		await Promise.resolve();
		expect(openLightboxMock).not.toHaveBeenCalled();
		expect(isPhotoSwipeBusy()).toBe(true);
		size.resolve(FULL_SIZE);
		await vi.waitFor(() => expect(openLightboxMock).toHaveBeenCalledOnce());

		expect(busyAtOpen).toBe(true);
		expect(isPhotoSwipeBusy()).toBe(false);
	});

	it("lets go of PhotoSwipe as soon as it is aborted during the full-size wait, then opens nothing", async () => {
		const size = Promise.withResolvers<MediaDimensions | null>();
		fullImageSizeInTimeMock.mockReturnValueOnce(size.promise);
		const controller = new AbortController();

		const opening = openPost({ signal: controller.signal });
		expect(isPhotoSwipeBusy()).toBe(true);
		controller.abort();
		expect(isPhotoSwipeBusy()).toBe(false);
		size.resolve(FULL_SIZE);
		await opening;

		expect(openLightboxMock).not.toHaveBeenCalled();
		expect(isPhotoSwipeBusy()).toBe(false);
	});

	it("passes a failed open on to its caller with PhotoSwipe no longer busy", async () => {
		const error = new Error("photoswipe failed to load");
		openLightboxMock.mockRejectedValueOnce(error);

		await expect(openPost()).rejects.toBe(error);

		expect(isPhotoSwipeBusy()).toBe(false);
	});
});
