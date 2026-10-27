import { prefersReducedMotion, Tween } from "svelte/motion";

import type { PullPosition } from "./scroll-chain";

const CONTENT_SELECTOR = ":scope > [data-refresh-content]";

const translateY = (px: number): Keyframe => ({
	transform: `translateY(${px}px)`,
});

const unnoticeable = (px: number) => Math.abs(px) < 0.5;

export type SlidePacer = { clockOrigin(): number };

const wallClock: SlidePacer = { clockOrigin: () => performance.now() };

export class PacingTween extends Tween<number> implements SlidePacer {
	#startedThisFlush: number | undefined;

	override set(...args: Parameters<Tween<number>["set"]>) {
		this.#startedThisFlush = performance.now();
		queueMicrotask(() => (this.#startedThisFlush = undefined));
		return super.set(...args);
	}

	clockOrigin(): number {
		return this.#startedThisFlush ?? performance.now();
	}
}

export function contentSlide({
	duration,
	easing,
	pacedBy = wallClock,
}: {
	duration: number;
	easing: string;
	pacedBy?: SlidePacer;
}) {
	let running: Animation | undefined;
	let startedAt = 0;

	const contentOf = (scroller: HTMLElement) =>
		prefersReducedMotion.current
			? null
			: scroller.querySelector<HTMLElement>(CONTENT_SELECTOR);

	function follow(): void {
		if (running?.playState === "running")
			running.currentTime = performance.now() - startedAt;
	}

	function stop(): void {
		if (!running) return;
		running.onfinish = null;
		running.cancel();
		running = undefined;
	}

	function interrupt({
		scroller,
		edge,
	}: {
		scroller: HTMLElement;
		edge: PullPosition;
	}) {
		follow();
		startedAt = pacedBy.clockOrigin();
		const content = contentOf(scroller);
		const from = content?.getBoundingClientRect()[edge] ?? 0;
		stop();
		return { content, from };
	}

	function play({
		content,
		keyframes,
		fill,
	}: {
		content: HTMLElement;
		keyframes: Keyframe[];
		fill: FillMode;
	}): Animation {
		const [first, ...rest] = keyframes;
		running = content.animate([{ ...first, easing }, ...rest], {
			duration,
			fill,
		});
		running.startTime = document.timeline.currentTime;
		return running;
	}

	return {
		across({
			scroller,
			edge,
			change,
		}: {
			scroller: HTMLElement;
			edge: PullPosition;
			change: () => void;
		}): void {
			const { content, from } = interrupt({ scroller, edge });
			change();
			if (!content) return;
			const offset = from - content.getBoundingClientRect()[edge];
			if (unnoticeable(offset)) return;
			play({
				content,
				keyframes: [translateY(offset), { transform: "none" }],
				fill: "none",
			});
		},
		ahead({
			scroller,
			byPx,
			change,
		}: {
			scroller: HTMLElement;
			byPx: number;
			change: () => void;
		}): void {
			const { content, from } = interrupt({ scroller, edge: "top" });
			if (!content) return change();
			const offset = from - content.getBoundingClientRect().top;
			if (unnoticeable(offset - byPx)) return change();
			play({
				content,
				keyframes: [translateY(offset), translateY(byPx)],
				fill: "forwards",
			}).onfinish = () => {
				change();
				stop();
			};
		},
		follow,
		cancel: stop,
	};
}
