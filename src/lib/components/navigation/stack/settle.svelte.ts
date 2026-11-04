import { type SettleIntent, settleTiming, type StackMotion } from "./motion";
import type { FrameAnimation, StackSurface } from "./surface";

const FULLY_IN = 0;
const fullyIn = () => FULLY_IN;

export class StackSettle {
	progress = 0;

	readonly #surface: StackSurface;
	readonly #motion: StackMotion;
	readonly #reducedMotion: () => boolean;

	#running = $state.raw<{ animation: FrameAnimation; target: number } | null>(
		null,
	);
	#floor: () => number = fullyIn;

	constructor({
		surface,
		motion,
		reducedMotion,
	}: {
		surface: StackSurface;
		motion: StackMotion;
		reducedMotion: () => boolean;
	}) {
		this.#surface = surface;
		this.#motion = motion;
		this.#reducedMotion = reducedMotion;
	}

	get settlingIn(): boolean {
		return this.#running?.target === FULLY_IN;
	}

	apply(): void {
		this.#surface.apply(this.progress);
	}

	track(progress: number): void {
		const finger = Math.min(1, Math.max(0, progress));
		const floor = this.#floor();
		this.progress = floor + (1 - floor) * finger;
		this.apply();
	}

	pickUp(): void {
		const running = this.#running;
		if (running?.target === FULLY_IN) {
			this.#running = null;
			this.#floor = running.animation.detach();
		} else this.stop();
		this.track(0);
	}

	async settleTo({
		target,
		intent,
		velocity,
	}: {
		target: number;
		intent: SettleIntent;
		velocity?: number;
	}): Promise<boolean> {
		const paneVelocity =
			velocity === undefined ? undefined : velocity * (1 - this.#floor());
		this.stop();
		const { duration, easing } = settleTiming({
			from: this.progress,
			to: target,
			intent,
			velocity: paneVelocity,
			motion: this.#motion,
		});
		const animation = this.#surface.animate({
			from: this.progress,
			to: target,
			duration: this.#reducedMotion() ? 0 : duration,
			easing,
		});
		this.#running = { animation, target };
		if (!(await animation.completed)) return false;
		this.#running = null;
		this.progress = target;
		return true;
	}

	stop(): void {
		const progress = this.#running?.animation.cancel();
		this.#running = null;
		this.#floor = fullyIn;
		if (progress !== undefined) this.progress = progress;
	}
}
