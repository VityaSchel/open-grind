import type { Attachment } from "svelte/attachments";

import { overlayOpen } from "#lib/platform/back-gesture-event.svelte.ts";
import { currentPlatform } from "#lib/platform/os.ts";
import { stackInMotion } from "#lib/platform/system-back-gesture.svelte.ts";
import { jumpThenGlideToTop } from "#lib/util/scroll.ts";
import { uncoveredCenter } from "#lib/util/uncovered-center.ts";

export type StatusBarTapTarget = {
	scroller: HTMLElement;
	scrollToTop?: () => void;
};

const targets: StatusBarTapTarget[] = [];

function scrolledInView(scroller: HTMLElement): boolean {
	return scroller.scrollTop > 0 && uncoveredCenter(scroller) !== null;
}

function scrollTappedScreenToTop(): void {
	if (overlayOpen() || stackInMotion()) return;
	const tapped = targets.findLast(({ scroller }) =>
		scrolledInView(scroller),
	)?.scroller;
	if (!tapped) return;
	const ownScroll = targets.findLast(
		(target) => target.scroller === tapped && target.scrollToTop,
	)?.scrollToTop;
	if (ownScroll) ownScroll();
	else jumpThenGlideToTop({ element: tapped });
}

function answerIosStatusBarTaps(target: StatusBarTapTarget): () => void {
	window.__iosStatusBarTap = scrollTappedScreenToTop;
	targets.push(target);
	return () => {
		const index = targets.indexOf(target);
		if (index !== -1) targets.splice(index, 1);
	};
}

export function answerStatusBarTaps(
	target: StatusBarTapTarget,
): (() => void) | undefined {
	switch (currentPlatform()) {
		case "ios":
			return answerIosStatusBarTaps(target);
		case "android":
		case "linux":
		case "macos":
		case "windows":
			return;
	}
}

export const scrollsToTopOnStatusBarTap: Attachment<HTMLElement> = (scroller) =>
	answerStatusBarTaps({ scroller });
