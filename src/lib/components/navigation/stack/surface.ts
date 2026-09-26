import { paneFrame } from "./motion";

type PaneElements = {
	front: HTMLElement | null;
	back: HTMLElement | null;
	dim: HTMLElement | null;
};

export type FrameAnimation = {
	completed: Promise<boolean>;
	cancel: () => number;
	detach: () => () => number;
};

export type StackSurface = {
	apply: (progress: number) => void;
	animate: (options: {
		from: number;
		to: number;
		duration: number;
		easing: string;
	}) => FrameAnimation;
};

export function paneSurface({
	panes,
	parallax,
}: {
	panes: () => PaneElements;
	parallax: () => boolean;
}): StackSurface {
	const frameAt = (progress: number) =>
		paneFrame({ progress, parallax: parallax() });

	const apply = (progress: number) => {
		const { front, back, dim } = panes();
		const frame = frameAt(progress);
		if (front) front.style.transform = frame.front;
		if (back) back.style.transform = frame.back;
		if (dim) dim.style.opacity = String(frame.dim);
	};

	return {
		apply,
		animate: ({ from, to, duration, easing }) => {
			const { front, back, dim } = panes();
			if (duration <= 0) {
				apply(to);
				return {
					completed: Promise.resolve(true),
					cancel: () => to,
					detach: () => () => to,
				};
			}

			const start = frameAt(from);
			const end = frameAt(to);
			const timing: KeyframeAnimationOptions = {
				duration,
				easing,
				fill: "both",
			};
			const running = [
				front?.animate(
					[{ transform: start.front }, { transform: end.front }],
					timing,
				),
				back?.animate(
					[{ transform: start.back }, { transform: end.back }],
					timing,
				),
				dim?.animate(
					[{ opacity: start.dim }, { opacity: end.dim }],
					timing,
				),
			].filter((animation) => animation !== undefined);

			const [clock, ...followers] = running;
			const reached = () => {
				const eased = clock?.effect?.getComputedTiming().progress;
				return typeof eased === "number"
					? from + (to - from) * eased
					: to;
			};

			let canceled = false;
			const completed = Promise.allSettled(
				running.map((animation) => animation.finished),
			).then(() => {
				if (!canceled) apply(to);
				for (const animation of running) animation.cancel();
				return !canceled;
			});

			return {
				completed,
				cancel: () => {
					canceled = true;
					const progress = reached();
					for (const animation of running) animation.cancel();
					return progress;
				},
				detach: () => {
					canceled = true;
					for (const animation of followers) animation.cancel();
					const effect = clock?.effect as
						| KeyframeEffect
						| null
						| undefined;
					if (effect) effect.target = null;
					return reached;
				},
			};
		},
	};
}
