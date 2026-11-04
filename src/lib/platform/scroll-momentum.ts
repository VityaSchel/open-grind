import { invoke } from "@tauri-apps/api/core";

import { currentPlatform } from "#lib/platform/os.ts";
import type { PagePoint } from "#lib/util/uncovered-center.ts";

const PROBED_HEIGHTS = [1 / 2, 3 / 4, 7 / 8];

const scrollableOverflow = (overflow: string) =>
	overflow === "auto" || overflow === "scroll";

function scrollsByItself(el: Element): boolean {
	const { overflowX, overflowY } = getComputedStyle(el);
	return (
		(scrollableOverflow(overflowY) && el.scrollHeight > el.clientHeight) ||
		(scrollableOverflow(overflowX) && el.scrollWidth > el.clientWidth)
	);
}

function innermostScroller(hit: Element): Element | null {
	for (let el: Element | null = hit; el; el = el.parentElement) {
		if (scrollsByItself(el)) return el;
	}
	return null;
}

function pointOnScroller(scroller: HTMLElement): PagePoint | null {
	const box = scroller.getBoundingClientRect();
	const x = box.left + box.width / 2;
	for (const height of PROBED_HEIGHTS) {
		const y = box.top + box.height * height;
		const hit = document.elementFromPoint(x, y);
		if (hit && innermostScroller(hit) === scroller) return { x, y };
	}
	return null;
}

function stopIosMomentum(scroller: HTMLElement): Promise<void> | undefined {
	const at = pointOnScroller(scroller);
	if (!at) return;
	return invoke("stop_scroll_momentum", { at }).then(
		() => {},
		(error: unknown) => {
			console.error("Failed to stop a coasting list", error);
		},
	);
}

export function stopScrollMomentum(
	scroller: HTMLElement,
): Promise<void> | undefined {
	switch (currentPlatform()) {
		case "ios":
			return stopIosMomentum(scroller);
		case "android":
		case "linux":
		case "macos":
		case "windows":
			return;
	}
}
