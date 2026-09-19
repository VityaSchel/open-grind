import { tick } from "svelte";
import type { OnNavigate } from "@sveltejs/kit";

import { canGoBack } from "$lib/util/history";
import { ancestorsOf, stackRelation, type StackRelation } from "./hierarchy";
import {
	CANCEL_EASING,
	COMMIT_EASING,
	SETTLE_MS,
	settleDuration,
} from "./motion";
import { type PaneSnapshot, snapshotPane } from "./snapshot";
import type { FrameAnimation, StackSurface } from "./surface";

export type LiveRole = "front" | "back";

function historyDirection(delta: number): StackRelation {
	return delta < 0 ? "pop" : "push";
}

export class PageStack {
	ghost = $state<PaneSnapshot | null>(null);
	liveRole = $state<LiveRole>("front");
	tracking = $state(false);

	readonly #surface: StackSurface;
	readonly #livePane: () => HTMLElement | null;
	readonly #reducedMotion: () => boolean;
	readonly #inScope: (pathname: string) => boolean;

	#ancestors: PaneSnapshot[] = [];
	#generation = 0;
	#progress = 0;
	#settling: FrameAnimation | null = null;
	#committedByGesture = false;

	constructor({
		surface,
		livePane,
		reducedMotion,
		inScope,
	}: {
		surface: StackSurface;
		livePane: () => HTMLElement | null;
		reducedMotion: () => boolean;
		inScope: (pathname: string) => boolean;
	}) {
		this.#surface = surface;
		this.#livePane = livePane;
		this.#reducedMotion = reducedMotion;
		this.#inScope = inScope;
	}

	get canSwipeBack(): boolean {
		return this.#ancestors.length > 0;
	}

	async navigate(navigation: OnNavigate): Promise<(() => void) | void> {
		const from = navigation.from?.url.pathname;
		const to = navigation.to?.url.pathname;
		if (!from || !to) return;

		this.tracking = false;
		const generation = ++this.#generation;

		if (this.#committedByGesture) {
			this.#committedByGesture = false;
			this.#ancestors = ancestorsOf(this.#ancestors, to);
			return () => void this.#adoptGhost();
		}

		this.#stopSettling();
		if (!this.#inScope(from) || !this.#inScope(to)) {
			this.#clear();
			return;
		}

		const relation =
			navigation.type === "popstate"
				? historyDirection(navigation.delta)
				: stackRelation(from, to);
		const pane = this.#livePane();
		if (!relation || !pane) {
			this.#ancestors = ancestorsOf(this.#ancestors, to);
			this.#rest();
			return;
		}

		const snapshot = snapshotPane(pane, from);
		if (relation === "push") this.#ancestors.push(snapshot);
		this.#ancestors = ancestorsOf(this.#ancestors, to);
		if (this.#reducedMotion()) {
			this.#rest();
			return;
		}

		const target = relation === "push" ? 0 : 1;
		this.ghost = snapshot;
		this.liveRole = relation === "push" ? "front" : "back";
		this.#progress = 1 - target;

		await tick();
		snapshot.restore();
		this.#surface.apply(this.#progress);

		return () => {
			if (generation !== this.#generation) return;
			void this.#settleTo(target, SETTLE_MS, COMMIT_EASING).then(
				(settled) => {
					if (settled) this.ghost = null;
				},
			);
		};
	}

	beginSwipeBack(): boolean {
		const previous = this.#ancestors.at(-1);
		if (!this.canSwipeBack || !previous || !this.#livePane()) return false;

		this.#stopSettling();
		this.ghost = previous;
		this.liveRole = "front";
		this.#progress = 0;
		this.tracking = true;
		void tick().then(() => {
			previous.restore();
			this.#surface.apply(this.#progress);
		});
		return true;
	}

	trackSwipeBack(progress: number): void {
		if (!this.tracking) return;
		this.#progress = Math.min(1, Math.max(0, progress));
		this.#surface.apply(this.#progress);
	}

	commitSwipeBack(): void {
		this.#finishSwipeBack(true);
	}

	cancelSwipeBack(): void {
		this.#finishSwipeBack(false);
	}

	#finishSwipeBack(commit: boolean): void {
		if (!this.tracking) return;
		this.tracking = false;

		const target = commit ? 1 : 0;

		void this.#settleTo(
			target,
			this.#reducedMotion() ? 0 : settleDuration(this.#progress, target),
			commit ? COMMIT_EASING : CANCEL_EASING,
		).then((settled) => {
			if (!settled) return;
			if (commit && canGoBack()) {
				this.#committedByGesture = true;
				history.back();
				return;
			}
			this.#progress = 0;
			this.#surface.apply(0);
			this.ghost = null;
		});
	}

	async #adoptGhost(): Promise<void> {
		await tick();
		this.#progress = 0;
		this.liveRole = "front";
		this.#surface.apply(0);
		this.ghost = null;
	}

	async #settleTo(
		target: number,
		duration: number,
		easing: string,
	): Promise<boolean> {
		this.#stopSettling();
		const animation = this.#surface.animate({
			from: this.#progress,
			to: target,
			duration,
			easing,
		});
		this.#settling = animation;
		if (!(await animation.completed)) return false;
		this.#settling = null;
		this.#progress = target;
		return true;
	}

	#stopSettling(): void {
		this.#settling?.cancel();
		this.#settling = null;
	}

	#clear(): void {
		this.#stopSettling();
		this.#ancestors = [];
		this.tracking = false;
		this.#rest();
	}

	#rest(): void {
		this.ghost = null;
		this.liveRole = "front";
		this.#progress = 0;
		this.#surface.apply(0);
	}
}
