import { tick } from "svelte";
import type { OnNavigate } from "@sveltejs/kit";

import { canGoBack } from "$lib/util/history";
import { ancestorsOf, stackRelation, type StackRelation } from "./hierarchy";
import { CANCEL_EASING, COMMIT_EASING } from "./motion";
import { StackSettle } from "./settle";
import { type PaneSnapshot, snapshotPane } from "./snapshot";
import type { StackSurface } from "./surface";

type LiveRole = "front" | "back";

function historyDirection(delta: number): StackRelation {
	return delta < 0 ? "pop" : "push";
}

export class PageStack {
	ghost = $state<PaneSnapshot | null>(null);
	liveRole = $state<LiveRole>("front");
	tracking = $state(false);

	readonly #settle: StackSettle;
	readonly #livePane: () => HTMLElement | null;
	readonly #reducedMotion: () => boolean;
	readonly #inScope: (pathname: string) => boolean;

	#ancestors: PaneSnapshot[] = [];
	#generation = 0;
	#backOwed = false;
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
		this.#settle = new StackSettle({ surface, reducedMotion });
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
		this.#backOwed = false;
		const generation = ++this.#generation;

		if (this.#committedByGesture) {
			this.#committedByGesture = false;
			this.#ancestors = ancestorsOf(this.#ancestors, to);
			return () => void this.#adoptGhost();
		}

		this.#settle.stop();
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
		this.#settle.progress = 1 - target;

		await tick();
		snapshot.restore();
		this.#settle.apply();

		return () => {
			if (generation !== this.#generation) return;
			void this.#settle
				.settleTo({ target, easing: COMMIT_EASING })
				.then((settled) => {
					if (settled) this.ghost = null;
				});
		};
	}

	beginSwipeBack(): boolean {
		if (this.#backOwed) {
			this.#settle.stop();
			this.#settle.track(1);
			this.#payBack();
			return false;
		}

		const previous = this.#ancestors.at(-1);
		if (!this.canSwipeBack || !previous || !this.#livePane()) return false;

		this.#settle.stop();
		this.ghost = previous;
		this.liveRole = "front";
		this.#settle.progress = 0;
		this.tracking = true;
		void tick().then(() => {
			previous.restore();
			this.#settle.apply();
		});
		return true;
	}

	trackSwipeBack(progress: number): void {
		if (!this.tracking) return;
		this.#settle.track(progress);
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
		this.#backOwed = commit && canGoBack();

		void this.#settle
			.settleTo({
				target: commit ? 1 : 0,
				easing: commit ? COMMIT_EASING : CANCEL_EASING,
			})
			.then((settled) => {
				if (!settled) return;
				if (this.#backOwed) {
					this.#payBack();
					return;
				}
				this.#settle.progress = 0;
				this.#settle.apply();
				this.ghost = null;
			});
	}

	#payBack(): void {
		this.#backOwed = false;
		this.#committedByGesture = true;
		history.back();
	}

	async #adoptGhost(): Promise<void> {
		await tick();
		this.#settle.progress = 0;
		this.liveRole = "front";
		this.#settle.apply();
		this.ghost = null;
	}

	#clear(): void {
		this.#settle.stop();
		this.#ancestors = [];
		this.tracking = false;
		this.#rest();
	}

	#rest(): void {
		this.ghost = null;
		this.liveRole = "front";
		this.#settle.progress = 0;
		this.#settle.apply();
	}
}
