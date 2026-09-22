import { flushSync } from "svelte";
import type { OnNavigate } from "@sveltejs/kit";

import type { StackSurface } from "./surface";

export type PendingAnimation = {
	from: number;
	to: number;
	duration: number;
	easing: string;
	reached: number;
	settle: (completed: boolean) => void;
};

export function fakeSurface() {
	const applied: number[] = [];
	const animations: PendingAnimation[] = [];

	const surface: StackSurface = {
		apply: (progress) => applied.push(progress),
		animate: ({ from, to, duration, easing }) => {
			let settle!: (completed: boolean) => void;
			const completed = new Promise<boolean>((resolve) => {
				settle = resolve;
			});
			const animation = {
				from,
				to,
				duration,
				easing,
				reached: to,
				settle,
			};
			animations.push(animation);
			return {
				completed,
				cancel: () => {
					settle(false);
					return animation.reached;
				},
			};
		},
	};

	return { surface, applied, animations };
}

function navigationTarget(pathname: string) {
	return {
		url: new URL(`http://app${pathname}`),
		params: {},
		route: { id: null },
	};
}

export function navigationEvent({
	from,
	to,
	delta,
}: {
	from: string;
	to: string;
	delta?: number;
}): OnNavigate {
	return {
		type: delta === undefined ? "link" : "popstate",
		delta,
		from: navigationTarget(from),
		to: navigationTarget(to),
	} as OnNavigate;
}

export async function flushMicrotasks() {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

export async function settleLast(animations: PendingAnimation[]) {
	animations.at(-1)?.settle(true);
	await flushMicrotasks();
	flushSync();
}
