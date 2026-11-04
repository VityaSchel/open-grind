import { tick } from "svelte";
import type { OnNavigate } from "$app/navigation";

import { StackSettle } from "#lib/components/navigation/stack/settle.svelte.ts";
import { Generation } from "#lib/util/generation.ts";
import { BACK_WATCHDOG_MS, canGoBack } from "#lib/util/history.ts";
import { isWithin } from "#lib/util/pathname.ts";
import type { StackMotion } from "#lib/components/navigation/stack/motion.ts";
import type { StackSurface } from "#lib/components/navigation/stack/surface.ts";
import type { SwipeRelease } from "#lib/platform/system-back-gesture.svelte.ts";
import { ancestorsOf, stackRelation, type StackRelation } from "./hierarchy";
import { type PaneSnapshot, snapshotPane } from "./snapshot";

type LiveRole = "front" | "back";

function historyDirection(delta: number): StackRelation {
	return delta < 0 ? "pop" : "push";
}

export class PageStackState {
	ghost = $state<PaneSnapshot | null>(null);
	liveRole = $state<LiveRole>("front");
	tracking = $state(false);
	committing = $state(false);

	readonly #settle: StackSettle;
	readonly #livePane: () => HTMLElement | null;
	readonly #reducedMotion: () => boolean;
	readonly #scope: string;

	#ancestors = $state.raw<PaneSnapshot[]>([]);
	#pushedFrom: { path: string }[];
	#generation = new Generation();
	#backOwed = false;
	#committedByGesture = false;
	#watchdog: ReturnType<typeof setTimeout> | undefined;

	constructor({
		surface,
		motion,
		livePane,
		reducedMotion,
		scope,
		pushedFrom,
	}: {
		surface: StackSurface;
		motion: StackMotion;
		livePane: () => HTMLElement | null;
		reducedMotion: () => boolean;
		scope: string;
		pushedFrom: { path: string }[];
	}) {
		this.#settle = new StackSettle({ surface, motion, reducedMotion });
		this.#livePane = livePane;
		this.#reducedMotion = reducedMotion;
		this.#scope = scope;
		this.#pushedFrom = pushedFrom;
	}

	get canBeginSwipeBack(): boolean {
		return this.#ancestors.length > 0 && this.#livePane() !== null;
	}

	async navigate(navigation: OnNavigate): Promise<(() => void) | void> {
		const from = navigation.from?.url.pathname;
		const to = navigation.to?.url.pathname;
		if (!from || !to) return;

		this.tracking = false;
		this.committing = false;
		this.#backOwed = false;
		this.#clearWatchdog();
		const generation = this.#generation.next();

		if (this.#committedByGesture) {
			this.#committedByGesture = false;
			this.#keepAncestorsOf(to);
			return () => void this.#adoptGhost();
		}

		this.#settle.stop();
		if (
			!isWithin({ pathname: from, root: this.#scope }) ||
			!isWithin({ pathname: to, root: this.#scope })
		) {
			this.#clear();
			return;
		}

		const relation =
			navigation.type === "popstate"
				? historyDirection(navigation.delta)
				: stackRelation({ from, to });
		const pane = this.#livePane();
		const pushedFromDestination = this.#pushedFrom.some(
			({ path }) => path === to,
		);
		if (
			!relation ||
			!pane ||
			(relation === "pop" && !pushedFromDestination)
		) {
			this.#keepAncestorsOf(to);
			this.#rest();
			return;
		}

		const snapshot = snapshotPane(pane, from);
		if (relation === "push") {
			this.#ancestors = [...this.#ancestors, snapshot];
			this.#pushedFrom.push(snapshot);
		}
		this.#keepAncestorsOf(to);
		if (this.#reducedMotion()) {
			this.#rest();
			return;
		}

		const target = relation === "push" ? 0 : 1;
		const turnsAround = this.ghost?.path === to;
		this.ghost = snapshot;
		this.liveRole = relation === "push" ? "front" : "back";
		if (!turnsAround) this.#settle.progress = 1 - target;

		await tick();
		snapshot.restore();
		this.#settle.apply();

		return () => {
			if (this.#generation.isStale(generation)) return;
			void this.#settle
				.settleTo({ target, intent: "commit" })
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
		if (!previous || !this.#livePane()) return false;

		this.ghost = previous;
		this.liveRole = "front";
		this.#settle.pickUp();
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

	commitSwipeBack(release?: SwipeRelease): void {
		this.#finishSwipeBack({ commit: true, velocity: release?.velocity });
	}

	cancelSwipeBack(release?: SwipeRelease): void {
		this.#finishSwipeBack({ commit: false, velocity: release?.velocity });
	}

	#finishSwipeBack({
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

		void this.#settle
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
				this.#settle.progress = 0;
				this.#settle.apply();
				this.ghost = null;
			});
	}

	#payBack(): void {
		this.#backOwed = false;
		this.#committedByGesture = true;
		this.#watchdog = setTimeout(
			() => this.#abandonBack(),
			BACK_WATCHDOG_MS,
		);
		history.back();
	}

	#abandonBack(): void {
		this.#watchdog = undefined;
		this.#committedByGesture = false;
		this.committing = false;
		void this.#settle
			.settleTo({ target: 0, intent: "cancel" })
			.then((settled) => {
				if (settled) this.ghost = null;
			});
	}

	#clearWatchdog(): void {
		clearTimeout(this.#watchdog);
		this.#watchdog = undefined;
	}

	async #adoptGhost(): Promise<void> {
		await tick();
		this.#settle.progress = 0;
		this.liveRole = "front";
		this.#settle.apply();
		this.ghost = null;
	}

	#keepAncestorsOf(pathname: string): void {
		this.#ancestors = ancestorsOf(this.#ancestors, pathname);
		this.#pushedFrom = ancestorsOf(this.#pushedFrom, pathname);
	}

	#clear(): void {
		this.#settle.stop();
		this.#ancestors = [];
		this.#pushedFrom = [];
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
