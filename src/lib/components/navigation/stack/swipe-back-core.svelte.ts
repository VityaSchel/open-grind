import { tick } from "svelte";

import { Generation } from "#lib/util/generation.ts";
import { BackWatchdog, canGoBack } from "#lib/util/history.ts";
import type { SwipeRelease } from "#lib/platform/system-back-gesture.svelte.ts";
import type { StackMotion } from "./motion";
import { StackSettle } from "./settle.svelte";
import type { Snapshot } from "./snapshot";
import type { StackSurface } from "./surface";

export type LiveRole = "front" | "back";

export type SwipeBackHost = {
	front: () => HTMLElement | null;
	ghostBehind: () => Snapshot | undefined;
	adopt: () => void | Promise<void>;
	navigationPending: () => boolean;
};

export type NavigationStart = {
	generation: number;
	adopt: (() => void) | undefined;
};

export class SwipeBackCore {
	ghost = $state.raw<Snapshot | null>(null);
	liveRole = $state<LiveRole>("front");
	tracking = $state(false);
	committing = $state(false);

	readonly settle: StackSettle;

	readonly #host: SwipeBackHost;
	readonly #generation = new Generation();
	readonly #backWatchdog = new BackWatchdog();
	#backOwed = false;
	#committedByGesture = $state(false);

	constructor({
		surface,
		motion,
		reducedMotion,
		host,
	}: {
		surface: StackSurface;
		motion: StackMotion;
		reducedMotion: () => boolean;
		host: SwipeBackHost;
	}) {
		this.settle = new StackSettle({ surface, motion, reducedMotion });
		this.#host = host;
	}

	get moving(): boolean {
		return this.ghost !== null;
	}

	get offersSwipeBack(): boolean {
		return (
			!this.#committedByGesture &&
			this.#host.front() !== null &&
			this.#host.ghostBehind() !== undefined
		);
	}

	startNavigation(): NavigationStart {
		this.tracking = false;
		this.committing = false;
		this.#backOwed = false;
		this.#backWatchdog.cancel();
		const generation = this.#generation.next();
		if (!this.#committedByGesture) return { generation, adopt: undefined };
		this.#committedByGesture = false;
		return { generation, adopt: () => void this.#host.adopt() };
	}

	isStale(generation: number): boolean {
		return this.#generation.isStale(generation);
	}

	begin(): boolean {
		if (this.#backOwed) {
			this.settle.stop();
			this.settle.track(1);
			this.#payBack();
			return false;
		}

		const ghost = this.#host.ghostBehind();
		if (!ghost || !this.offersSwipeBack) return false;

		this.ghost = ghost;
		this.liveRole = "front";
		this.settle.pickUp();
		this.tracking = true;
		void tick().then(() => {
			ghost.restore();
			this.settle.apply();
		});
		return true;
	}

	track(progress: number): void {
		if (!this.tracking) return;
		this.settle.track(progress);
	}

	commit(release?: SwipeRelease): void {
		this.#finish({ commit: true, velocity: release?.velocity });
	}

	cancel(release?: SwipeRelease): void {
		this.#finish({ commit: false, velocity: release?.velocity });
	}

	rest(): void {
		this.ghost = null;
		this.liveRole = "front";
		this.settle.progress = 0;
		this.settle.apply();
	}

	#finish({
		commit,
		velocity,
	}: {
		commit: boolean;
		velocity: number | undefined;
	}): void {
		if (!this.tracking) return;
		this.tracking = false;
		this.#backOwed = commit && canGoBack();
		this.committing = this.#backOwed;
		if (this.committing && document.activeElement instanceof HTMLElement)
			document.activeElement.blur();

		void this.settle
			.settleTo({
				target: commit ? 1 : 0,
				intent: commit ? "commit" : "cancel",
				velocity,
			})
			.then((settled) => {
				if (!settled) return;
				if (this.#backOwed) {
					this.#payBack();
					return;
				}
				this.rest();
			});
	}

	#payBack(): void {
		this.#backOwed = false;
		if (this.#host.navigationPending()) {
			this.#abandonBack();
			return;
		}
		this.#committedByGesture = true;
		this.#backWatchdog.back({ stalled: () => this.#abandonBack() });
	}

	#abandonBack(): void {
		this.#committedByGesture = false;
		this.committing = false;
		void this.settle
			.settleTo({ target: 0, intent: "cancel" })
			.then((settled) => {
				if (settled) this.ghost = null;
			});
	}
}
