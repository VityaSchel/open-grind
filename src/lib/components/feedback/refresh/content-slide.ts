import { prefersReducedMotion } from "svelte/motion";

import type { PullPosition } from "./scroll-chain";

const CONTENT_SELECTOR = ":scope > [data-refresh-content]";

const translateY = (px: number): Keyframe => ({
	transform: `translateY(${px}px)`,
});

const unnoticeable = (px: number) => Math.abs(px) < 0.5;

export function contentSlide({ timing }: { timing: KeyframeAnimationOptions }) {
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
		startedAt = performance.now();
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
		running = content.animate(keyframes, { ...timing, fill });
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
