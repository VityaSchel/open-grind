// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MediaSheetBody from "./MediaSheetBody.svelte";

const PEEK_PX = 300;
const SETTLE_QUIET_MS = 140;

let resizeCallbacks: (() => void)[];

function measurePeek(container: HTMLElement) {
	const peek = container.querySelector<HTMLElement>(
		'[data-slot="sheet-peek"]',
	)!;
	Object.defineProperty(peek, "offsetHeight", { value: PEEK_PX });
}

function renderSheet() {
	const { component, container, rerender } = render(MediaSheetBody, {
		props: {
			children: createRawSnippet(() => ({ render: () => "<div></div>" })),
		},
	});
	const scroller = container.querySelector<HTMLElement>(
		'[data-slot="sheet-scroller"]',
	)!;
	measurePeek(container);
	let scrollTop = 0;
	Object.defineProperty(scroller, "scrollTop", {
		get: () => scrollTop,
		set: (value: number) => (scrollTop = value),
	});
	const scrollTo = vi.fn();
	scroller.scrollTo = scrollTo;
	const leaveAt = (top: number) => {
		scrollTop = top;
		scroller.dispatchEvent(new Event("scroll"));
	};
	const setFullsize = async (fullsize: boolean) => {
		await rerender({ fullsize });
		if (fullsize) measurePeek(container);
	};
	return {
		sheet: component,
		scrollTo,
		leaveAt,
		setFullsize,
		scrollTop: () => scrollTop,
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	resizeCallbacks = [];
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: () => void) {
				resizeCallbacks.push(callback);
			}
			observe() {}
			disconnect() {}
		},
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("MediaSheetBody", () => {
	it("settles a sheet left between its sizes to the nearer one", () => {
		const { scrollTo, leaveAt } = renderSheet();

		leaveAt(100);
		vi.advanceTimersByTime(SETTLE_QUIET_MS);

		expect(scrollTo).toHaveBeenCalledWith(
			expect.objectContaining({ top: 0 }),
		);
	});

	it("keeps its size while held and settles once released", () => {
		const { sheet, scrollTo, leaveAt } = renderSheet();

		const release = sheet.holdSize();
		leaveAt(100);
		vi.advanceTimersByTime(SETTLE_QUIET_MS * 4);
		expect(scrollTo).not.toHaveBeenCalled();

		release();
		vi.advanceTimersByTime(SETTLE_QUIET_MS);

		expect(scrollTo).toHaveBeenCalledWith(
			expect.objectContaining({ top: 0 }),
		);
	});

	it("cancels a settle that was already waiting when a hold begins", () => {
		const { sheet, scrollTo, leaveAt } = renderSheet();

		leaveAt(200);
		vi.advanceTimersByTime(SETTLE_QUIET_MS / 2);
		const release = sheet.holdSize();
		vi.advanceTimersByTime(SETTLE_QUIET_MS * 4);

		expect(scrollTo).not.toHaveBeenCalled();
		release();
	});

	it("forgets a scrolled tab's place once the sheet stops being fullsize", async () => {
		vi.useRealTimers();
		const { leaveAt, setFullsize, scrollTop } = renderSheet();
		resizeCallbacks.at(-1)?.();
		leaveAt(PEEK_PX + 500);

		await setFullsize(false);
		leaveAt(0);
		await setFullsize(true);
		resizeCallbacks.at(-1)?.();

		expect(scrollTop()).toBe(0);
	});

	it("puts content back at a saved place only while expanded", () => {
		const { sheet, leaveAt, scrollTop } = renderSheet();
		resizeCallbacks.at(-1)?.();

		leaveAt(100);
		sheet.restoreContentScrollTop(250);
		expect(scrollTop()).toBe(100);

		leaveAt(PEEK_PX);
		sheet.restoreContentScrollTop(250);
		expect(scrollTop()).toBe(PEEK_PX + 250);
		expect(sheet.contentScrollTop()).toBe(250);
	});
});
