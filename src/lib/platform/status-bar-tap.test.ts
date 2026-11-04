// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { jumpThenGlideToTop, stacks } = vi.hoisted(() => ({
	jumpThenGlideToTop: vi.fn(),
	stacks: { moving: false },
}));

vi.mock("#lib/util/scroll.ts", () => ({ jumpThenGlideToTop }));
vi.mock("#lib/platform/system-back-gesture.svelte.ts", () => ({
	stackInMotion: () => stacks.moving,
}));

import { backGestureEventHandlers } from "#lib/platform/back-gesture-event.svelte.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { SupportedPlatform } from "#lib/platform/os.ts";
import {
	answerStatusBarTaps,
	scrollsToTopOnStatusBarTap,
	type StatusBarTapTarget,
} from "./status-bar-tap";

let detachers: (() => void)[] = [];

function list({ scrollTop = 900 } = {}): HTMLElement {
	const element = document.createElement("div");
	element.append(document.createElement("p"));
	vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 62, 402, 778),
	);
	element.scrollTop = scrollTop;
	document.body.append(element);
	return element;
}

function showing(element: Element) {
	document.elementFromPoint = () => element.firstElementChild;
}

function answer(target: StatusBarTapTarget) {
	const stop = answerStatusBarTaps(target);
	if (stop) detachers.push(stop);
	return stop;
}

const tapStatusBar = () => window.__iosStatusBarTap?.();

beforeEach(() => {
	runningOn("ios");
});

afterEach(() => {
	for (const detach of detachers) detach();
	detachers = [];
	delete window.__iosStatusBarTap;
	backGestureEventHandlers.clear();
	stacks.moving = false;
	jumpThenGlideToTop.mockClear();
	resetPlatform();
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe("status-bar taps on iOS", () => {
	it("glide the uncovered list on screen to its top", () => {
		const scroller = list();
		answer({ scroller });
		showing(scroller);

		tapStatusBar();

		expect(jumpThenGlideToTop).toHaveBeenCalledExactlyOnceWith({
			element: scroller,
		});
	});

	it("run a list's own scroll to the top in place of the shared glide", () => {
		const scroller = list();
		const scrollToTop = vi.fn();
		answer({ scroller });
		answer({ scroller, scrollToTop });
		answer({ scroller });
		showing(scroller);

		tapStatusBar();

		expect(scrollToTop).toHaveBeenCalledOnce();
		expect(jumpThenGlideToTop).not.toHaveBeenCalled();
	});

	it("pass over a list that something covers for the one on top", () => {
		const below = list();
		const onTop = list();
		answer({ scroller: onTop });
		answer({ scroller: below });
		showing(onTop);

		tapStatusBar();

		expect(jumpThenGlideToTop).toHaveBeenCalledExactlyOnceWith({
			element: onTop,
		});
	});

	it("leave a list that already sits at its top", () => {
		const scroller = list({ scrollTop: 0 });
		answer({ scroller });
		showing(scroller);

		tapStatusBar();

		expect(jumpThenGlideToTop).not.toHaveBeenCalled();
	});

	it("do nothing while an overlay is open, but scroll under an armed reply", () => {
		const scroller = list();
		answer({ scroller });
		showing(scroller);
		const closeSheet = () => false;
		backGestureEventHandlers.set(closeSheet, "overlay");
		backGestureEventHandlers.set(() => false, "screen");

		tapStatusBar();
		expect(jumpThenGlideToTop).not.toHaveBeenCalled();

		backGestureEventHandlers.delete(closeSheet);
		tapStatusBar();
		expect(jumpThenGlideToTop).toHaveBeenCalledOnce();
	});

	it("do nothing while a stack tracks a swipe or slides a page", () => {
		const scroller = list();
		answer({ scroller });
		showing(scroller);
		stacks.moving = true;

		tapStatusBar();

		expect(jumpThenGlideToTop).not.toHaveBeenCalled();
	});

	it("stop reaching a list once it unmounts", () => {
		const scroller = list();
		const stop = answer({ scroller });
		showing(scroller);

		stop?.();
		tapStatusBar();

		expect(jumpThenGlideToTop).not.toHaveBeenCalled();
	});

	it("reach a list through the attachment", () => {
		const scroller = list();
		const detach = scrollsToTopOnStatusBarTap(scroller);
		if (detach) detachers.push(detach);
		showing(scroller);

		tapStatusBar();

		expect(jumpThenGlideToTop).toHaveBeenCalledExactlyOnceWith({
			element: scroller,
		});
	});
});

describe("status-bar taps elsewhere", () => {
	for (const platform of [
		"android",
		"linux",
		"macos",
		"windows",
	] satisfies SupportedPlatform[]) {
		it(`register nothing on ${platform}`, () => {
			runningOn(platform);

			expect(answer({ scroller: list() })).toBeUndefined();
			expect(window.__iosStatusBarTap).toBeUndefined();
		});
	}
});
