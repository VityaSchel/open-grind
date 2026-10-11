import type { Page } from "@playwright/test";

type Size = { width: number; height: number };

const TRANSITION_START_TIMEOUT_MS = 10_000;

export function introSizes({
	page,
	within,
}: {
	page: Page;
	within: string;
}): Promise<{ atEnd: Size[]; settled: Size[] }> {
	return page.evaluate(
		async ({ within, timeoutMs }) => {
			const nextFrame = () =>
				new Promise((resolve) => requestAnimationFrame(resolve));
			const targetOf = (animation: Animation) =>
				animation.effect instanceof KeyframeEffect
					? animation.effect.target
					: null;
			const isSvelteTransition = (animation: Animation) =>
				animation.constructor === Animation &&
				Number(animation.effect?.getTiming().duration) > 0 &&
				targetOf(animation)?.closest(within);
			const sizeOf = (target: Element) => {
				const { width, height } = target.getBoundingClientRect();
				return { width, height };
			};
			const deadline = performance.now() + timeoutMs;
			let intros: Animation[] = [];
			while (intros.length === 0) {
				if (performance.now() > deadline) {
					throw new Error(`No transition started within ${within}`);
				}
				await nextFrame();
				intros = document.getAnimations().filter(isSvelteTransition);
			}
			const targets = intros.flatMap((intro) => targetOf(intro) ?? []);
			for (const intro of intros) intro.finish();
			const atEnd = targets.map(sizeOf);
			while (intros.some((intro) => intro.playState !== "idle")) {
				await nextFrame();
			}
			return { atEnd, settled: targets.map(sizeOf) };
		},
		{ within, timeoutMs: TRANSITION_START_TIMEOUT_MS },
	);
}
