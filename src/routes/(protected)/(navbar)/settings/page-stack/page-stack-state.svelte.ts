import { tick } from "svelte";
import type { OnNavigate } from "$app/navigation";

import { snapshotPane } from "#lib/components/navigation/stack/snapshot.ts";
import {
	type LiveRole,
	SwipeBackCore,
} from "#lib/components/navigation/stack/swipe-back-core.svelte.ts";
import { isWithin } from "#lib/util/pathname.ts";
import type { StackMotion } from "#lib/components/navigation/stack/motion.ts";
import type { ScreenSnapshots } from "#lib/components/navigation/stack/screen-snapshots.svelte.ts";
import type { Snapshot } from "#lib/components/navigation/stack/snapshot.ts";
import type { StackSurface } from "#lib/components/navigation/stack/surface.ts";
import type { SwipeRelease } from "#lib/platform/system-back-gesture.svelte.ts";
import { ancestorsOf, stackRelation, type StackRelation } from "./hierarchy";

function historyDirection(delta: number): StackRelation {
	return delta < 0 ? "pop" : "push";
}

export class PageStackState {
	readonly #swipe: SwipeBackCore;
	readonly #snapshots: ScreenSnapshots;
	readonly #livePane: () => HTMLElement | null;
	readonly #reducedMotion: () => boolean;
	readonly #scope: string;

	#pushedFrom: { path: string }[];

	constructor({
		surface,
		motion,
		livePane,
		reducedMotion,
		scope,
		pushedFrom,
		snapshots,
		navigationPending,
	}: {
		surface: StackSurface;
		motion: StackMotion;
		livePane: () => HTMLElement | null;
		reducedMotion: () => boolean;
		scope: string;
		pushedFrom: { path: string }[];
		snapshots: ScreenSnapshots;
		navigationPending: () => boolean;
	}) {
		this.#swipe = new SwipeBackCore({
			surface,
			motion,
			reducedMotion,
			host: {
				front: livePane,
				ghostBehind: () => snapshots.behind("pane"),
				adopt: async () => {
					await tick();
					this.#swipe.rest();
				},
				navigationPending,
			},
		});
		this.#snapshots = snapshots;
		this.#livePane = livePane;
		this.#reducedMotion = reducedMotion;
		this.#scope = scope;
		this.#pushedFrom = pushedFrom;
	}

	get ghost(): Snapshot | null {
		return this.#swipe.ghost;
	}

	get liveRole(): LiveRole {
		return this.#swipe.liveRole;
	}

	get tracking(): boolean {
		return this.#swipe.tracking;
	}

	get committing(): boolean {
		return this.#swipe.committing;
	}

	get moving(): boolean {
		return this.#swipe.moving;
	}

	get offersSwipeBack(): boolean {
		return this.#swipe.offersSwipeBack;
	}

	async navigate(navigation: OnNavigate): Promise<(() => void) | void> {
		const from = navigation.from?.url.pathname;
		const to = navigation.to?.url.pathname;
		if (!from || !to) return;

		const swipe = this.#swipe;
		const { generation, adopt } = swipe.startNavigation();
		if (adopt) {
			this.#keepPushedFromOf(to);
			return adopt;
		}

		swipe.settle.stop();
		if (
			!isWithin({ pathname: from, root: this.#scope }) ||
			!isWithin({ pathname: to, root: this.#scope })
		) {
			this.#pushedFrom = [];
			swipe.rest();
			return;
		}

		const relation =
			navigation.type === "popstate"
				? historyDirection(navigation.delta)
				: stackRelation({ from, to });
		const slides =
			relation === "push" ||
			(relation === "pop" &&
				this.#pushedFrom.some(({ path }) => path === to));
		const remembered = relation !== "pop" && this.#snapshots.accepts();
		const pane = this.#livePane();
		const snapshot =
			pane && (slides || remembered)
				? snapshotPane({ pane, path: from })
				: null;
		if (snapshot && remembered)
			this.#snapshots.remember({ snapshot, kind: "pane" });
		if (snapshot && relation === "push")
			this.#pushedFrom.push({ path: from });
		this.#keepPushedFromOf(to);
		if (!snapshot || !slides || this.#reducedMotion()) {
			swipe.rest();
			return;
		}

		const target = relation === "push" ? 0 : 1;
		const turnsAround = swipe.ghost?.path === to;
		swipe.ghost = snapshot;
		swipe.liveRole = relation === "push" ? "front" : "back";
		if (!turnsAround) swipe.settle.progress = 1 - target;
		swipe.settle.apply();

		await tick();
		snapshot.restore();
		swipe.settle.apply();

		return () => {
			if (swipe.isStale(generation)) return;
			void swipe.settle
				.settleTo({ target, intent: "commit" })
				.then((settled) => {
					if (settled) swipe.ghost = null;
				});
		};
	}

	beginSwipeBack(): boolean {
		return this.#swipe.begin();
	}

	trackSwipeBack(progress: number): void {
		this.#swipe.track(progress);
	}

	commitSwipeBack(release?: SwipeRelease): void {
		this.#swipe.commit(release);
	}

	cancelSwipeBack(release?: SwipeRelease): void {
		this.#swipe.cancel(release);
	}

	#keepPushedFromOf(pathname: string): void {
		this.#pushedFrom = ancestorsOf(this.#pushedFrom, pathname);
	}
}
