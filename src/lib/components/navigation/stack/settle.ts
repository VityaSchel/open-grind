import { settleDuration } from "./motion";
import type { FrameAnimation, StackSurface } from "./surface";

export class StackSettle {
	progress = 0;

	readonly #surface: StackSurface;
	readonly #reducedMotion: () => boolean;

	#running: FrameAnimation | null = null;

	constructor({
		surface,
		reducedMotion,
	}: {
		surface: StackSurface;
		reducedMotion: () => boolean;
	}) {
		this.#surface = surface;
		this.#reducedMotion = reducedMotion;
	}

	apply(): void {
		this.#surface.apply(this.progress);
	}

	track(progress: number): void {
		this.progress = Math.min(1, Math.max(0, progress));
		this.apply();
	}

	async settleTo({
		target,
		easing,
	}: {
		target: number;
		easing: string;
	}): Promise<boolean> {
		this.stop();
		const animation = this.#surface.animate({
			from: this.progress,
			to: target,
			duration: this.#reducedMotion()
				? 0
				: settleDuration(this.progress, target),
			easing,
		});
		this.#running = animation;
		if (!(await animation.completed)) return false;
		this.#running = null;
		this.progress = target;
		return true;
	}

	stop(): void {
		const progress = this.#running?.cancel();
		this.#running = null;
		if (progress !== undefined) this.progress = progress;
	}
}
