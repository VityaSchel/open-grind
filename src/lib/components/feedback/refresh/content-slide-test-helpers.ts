import { expoOut } from "svelte/easing";

export type ContentSlide = {
	fromPx: number;
	toPx: number;
	timing: KeyframeAnimationOptions;
	pinnedAt: number | null;
	startTime: number | null;
	cancelled: boolean;
};

const translatePx = ({ transform }: Keyframe) =>
	transform === "none"
		? 0
		: Number(/^translateY\((.+)px\)$/.exec(String(transform))?.[1]);

export function contentSlideRecorder() {
	const slides: ContentSlide[] = [];
	let frameClockMs = () => performance.now();

	const elapsedMs = (slide: ContentSlide) => {
		slide.startTime ??= frameClockMs();
		return frameClockMs() - slide.startTime;
	};
	const finished = (slide: ContentSlide) =>
		elapsedMs(slide) >= Number(slide.timing.duration);

	return {
		slides: () => [...slides],
		installTimeline() {
			Object.defineProperty(document, "timeline", {
				configurable: true,
				value: {
					get currentTime() {
						return frameClockMs();
					},
				},
			});
		},
		removeTimeline() {
			Reflect.deleteProperty(document, "timeline");
		},
		stallFrameClock() {
			const stalledAt = performance.now();
			frameClockMs = () => stalledAt;
		},
		offsetPx() {
			const running = slides.findLast(({ cancelled }) => !cancelled);
			if (!running) return 0;
			if (finished(running))
				return running.timing.fill === "forwards" ? running.toPx : 0;
			const progress = Math.max(
				0,
				elapsedMs(running) / Number(running.timing.duration),
			);
			return (
				running.fromPx +
				(running.toPx - running.fromPx) * expoOut(progress)
			);
		},
		record({
			keyframes: [from, to],
			timing,
		}: {
			keyframes: [Keyframe, Keyframe];
			timing: KeyframeAnimationOptions;
		}): Animation {
			const slide: ContentSlide = {
				fromPx: translatePx(from),
				toPx: translatePx(to),
				timing,
				pinnedAt: null,
				startTime: null,
				cancelled: false,
			};
			slides.push(slide);
			const animation = {
				onfinish: null as (() => void) | null,
				get playState() {
					if (slide.cancelled) return "idle";
					return finished(slide) ? "finished" : "running";
				},
				get startTime() {
					return slide.startTime;
				},
				set startTime(time: number | null) {
					slide.startTime = time;
					slide.pinnedAt ??= time;
				},
				get currentTime() {
					return elapsedMs(slide);
				},
				set currentTime(time: number) {
					slide.startTime = frameClockMs() - time;
				},
				cancel: () => (slide.cancelled = true),
			};
			const watchForFinish = () => {
				if (slide.cancelled) return;
				if (finished(slide)) return animation.onfinish?.();
				requestAnimationFrame(watchForFinish);
			};
			requestAnimationFrame(watchForFinish);
			return animation as unknown as Animation;
		},
	};
}
