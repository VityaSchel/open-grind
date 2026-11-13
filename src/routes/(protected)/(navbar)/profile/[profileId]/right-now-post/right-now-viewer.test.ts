// @vitest-environment jsdom

import { within } from "@testing-library/svelte";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import { mount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type PhotoSwipe from "photoswipe";

import {
	applyPhotoSwipeBarAction,
	applyPhotoSwipeCaption,
	closeWhenOpen,
} from "./right-now-viewer";
import RightNowPostCaption from "./RightNowPostCaption.svelte";
import RightNowPostViewerAction from "./RightNowPostViewerAction.svelte";

const POST_TEXT = "Gym's done, now what?";
const teardowns: (() => void)[] = [];

afterEach(() => {
	for (const teardown of teardowns.splice(0)) teardown();
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

function captionRender() {
	return vi.fn(({ target }: { target: HTMLElement; pswp: PhotoSwipe }) =>
		mount(RightNowPostCaption, {
			target,
			props: {
				text: POST_TEXT,
				displayName: "theo",
				onlineUntil: null,
				posted: null,
				hosting: true,
			},
		}),
	);
}

function captionPanelOf(pswp: PhotoSwipe) {
	return pswp.element!.querySelector<HTMLElement>(".pswp__caption-panel")!;
}

describe("applyPhotoSwipeCaption", () => {
	it("mounts the caption in a panel on the viewer and unmounts it when the viewer closes", async () => {
		const lightbox = viewer();
		const render = captionRender();
		applyPhotoSwipeCaption(lightbox, { render });

		const pswp = await open(lightbox);
		const panel = captionPanelOf(pswp);

		expect(panel.parentElement).toBe(pswp.element);
		expect(render).toHaveBeenCalledExactlyOnceWith({ target: panel, pswp });
		expect(within(panel).getByText(POST_TEXT)).toBeTruthy();

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
		applyPhotoSwipeCaption(lightbox, { render: captionRender() });
		const padding = () =>
			lightbox.options.paddingFn!({ x: 400, y: 800 }, {}, 0);

		const pswp = await open(lightbox);
		captionPanelOf(pswp).getBoundingClientRect = () =>
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
		applyPhotoSwipeCaption(lightbox, { render: captionRender() });

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
		const render = vi.fn(
			({ target }: { target: HTMLElement; pswp: PhotoSwipe }) =>
				mount(RightNowPostViewerAction, {
					target,
					props: { own: true, onedit: vi.fn(), onreport: vi.fn() },
				}),
		);
		applyPhotoSwipeBarAction(lightbox, { render });

		const pswp = await open(lightbox);
		const bar = pswp.element!.querySelector<HTMLElement>(".pswp__top-bar")!;
		const action = bar.querySelector<HTMLElement>(".pswp__bar-action")!;

		expect(render).toHaveBeenCalledExactlyOnceWith({
			target: action,
			pswp,
		});
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
