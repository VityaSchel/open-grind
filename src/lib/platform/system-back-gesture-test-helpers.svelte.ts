import { flushSync } from "svelte";

import type {
	SwipeBackStack,
	SwipeRelease,
} from "./system-back-gesture.svelte";

export function makeStack({ offers = true }: { offers?: boolean } = {}) {
	let tracking = $state(false);
	let moving = $state(false);
	let offersSwipeBack = $state(offers);
	let covering = $state(false);
	const calls = { begin: 0, commit: 0, cancel: 0, prepare: 0, undo: 0 };
	const tracked: number[] = [];
	const releases: (SwipeRelease | undefined)[] = [];

	const stack: SwipeBackStack = {
		get tracking() {
			return tracking;
		},
		get moving() {
			return moving;
		},
		get offersSwipeBack() {
			return offersSwipeBack;
		},
		get covering() {
			return covering;
		},
		beginSwipeBack: () => {
			calls.begin += 1;
			tracking = true;
			return true;
		},
		trackSwipeBack: (progress) => {
			tracked.push(progress);
		},
		commitSwipeBack: (release) => {
			releases.push(release);
			calls.commit += 1;
			tracking = false;
		},
		cancelSwipeBack: (release) => {
			releases.push(release);
			calls.cancel += 1;
			tracking = false;
		},
		prepareSwipeBack: () => {
			calls.prepare += 1;
			return () => {
				calls.undo += 1;
			};
		},
	};

	const offerSwipeBack = (offered: boolean) => {
		offersSwipeBack = offered;
		flushSync();
	};

	const slide = (sliding: boolean) => {
		moving = sliding;
	};

	const cover = (covered: boolean) => {
		covering = covered;
		flushSync();
	};

	return { stack, calls, tracked, releases, offerSwipeBack, slide, cover };
}
