import { tick } from "svelte";
import type { NavigationTarget, OnNavigate } from "$app/navigation";

import { TRANSPARENT_PIXEL } from "#lib/util/load-when-visible.ts";
import { entryPathname } from "#lib/util/pathname.ts";
import type {
	EdgeZone,
	SwipeRelease,
} from "#lib/platform/system-back-gesture.svelte.ts";
import type { StackMotion } from "./motion";
import {
	closeScreenLanding,
	ghostFixupFor,
	openScreenLanding,
	type ScreenLanding,
} from "./screen-root";
import type { ScreenSnapshots } from "./screen-snapshots.svelte";
import { capturesScreen, hidesNavBar } from "./screen-swipe-routes";
import { type Snapshot, snapshotScreen } from "./snapshot";
import type { StackSurface } from "./surface";
import { SwipeBackCore } from "./swipe-back-core.svelte";

export const SCREEN_ELEMENT_BUDGET = 4000;
export const LANDING_CAP_MS = 300;
export const PREPARED_QUIET_MS = 300;

const CAPTURE_MEASURE = "screen-stack-capture";
const CAPTURE_START = `${CAPTURE_MEASURE}-start`;
const WATCHING = { capture: true, passive: true } as const;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function inViewport(element: Element): boolean {
	const { top, right, bottom, left } = element.getBoundingClientRect();
	return bottom > 0 && right > 0 && top < innerHeight && left < innerWidth;
}

function showsPlaceholder(image: HTMLImageElement): boolean {
	return image.getAttribute("src") === TRANSPARENT_PIXEL;
}

function imageShown({
	image,
	signal,
}: {
	image: HTMLImageElement;
	signal: AbortSignal;
}): Promise<void> {
	if (!showsPlaceholder(image)) return image.decode();
	return new Promise((resolve) => {
		const observer = new MutationObserver(() => {
			if (showsPlaceholder(image)) return;
			observer.disconnect();
			resolve(image.decode());
		});
		observer.observe(image, { attributeFilter: ["src"] });
		signal.addEventListener(
			"abort",
			() => {
				observer.disconnect();
				resolve();
			},
			{ once: true },
		);
	});
}

function imagesShown({
	root,
	signal,
}: {
	root: HTMLElement | null;
	signal: AbortSignal;
}): Promise<unknown> {
	if (!root) return Promise.resolve();
	const images = [...root.querySelectorAll("img")].filter(inViewport);
	return Promise.allSettled(
		images.map((image) => imageShown({ image, signal })),
	);
}

async function landed({
	landing,
	root,
	signal,
}: {
	landing: ScreenLanding;
	root: () => HTMLElement | null;
	signal: AbortSignal;
}): Promise<void> {
	await tick();
	await tick();
	await Promise.all([
		landing.released(),
		imagesShown({ root: root(), signal }),
	]);
}

function withFixup(snapshot: Snapshot): Snapshot {
	const fixup = ghostFixupFor(snapshot.path);
	if (!fixup) return snapshot;
	return {
		...snapshot,
		restore: () => {
			snapshot.restore();
			fixup(snapshot.node);
		},
	};
}

export class ScreenStackState {
	readonly edgeZone: EdgeZone = "goes-back";
	covering = $state(false);
	staged: Snapshot | null = $derived.by(() => {
		if (this.#core.ghost) return this.#core.ghost;
		if (this.#front() === null) return null;
		return this.#snapshots.behind("screen") ?? null;
	});

	readonly #core: SwipeBackCore;
	readonly #snapshots: ScreenSnapshots;
	readonly #root: () => HTMLElement | null;
	readonly #front: () => HTMLElement | null;
	readonly #navBar: () => HTMLElement | null;

	#prepared = $state(false);
	#preparing: AbortController | null = null;
	#landing: ScreenLanding | null = null;

	constructor({
		surface,
		motion,
		reducedMotion,
		snapshots,
		root,
		front,
		navBar = () => null,
		navigationPending,
	}: {
		surface: StackSurface;
		motion: StackMotion;
		reducedMotion: () => boolean;
		snapshots: ScreenSnapshots;
		root: () => HTMLElement | null;
		front: () => HTMLElement | null;
		navBar?: () => HTMLElement | null;
		navigationPending: () => boolean;
	}) {
		this.#core = new SwipeBackCore({
			surface,
			motion,
			reducedMotion,
			host: {
				front,
				ghostBehind: () => snapshots.behind("screen"),
				adopt: () => this.#land(),
				navigationPending,
			},
		});
		this.#snapshots = snapshots;
		this.#root = root;
		this.#front = front;
		this.#navBar = navBar;
	}

	get front(): HTMLElement | null {
		return this.#front();
	}

	get revealed(): boolean {
		return this.#core.ghost !== null || this.#prepared;
	}

	get tracking(): boolean {
		return this.#core.tracking;
	}

	get committing(): boolean {
		return this.#core.committing;
	}

	get moving(): boolean {
		return this.#core.moving;
	}

	get offersSwipeBack(): boolean {
		return !this.covering && this.#core.offersSwipeBack;
	}

	navigate(navigation: OnNavigate): (() => void) | undefined {
		const { from, to } = navigation;
		if (!from || !to || this.#snapshots.replaces()) return;

		const core = this.#core;
		const { adopt } = core.startNavigation();
		this.#stopPreparing();
		this.#stopLanding();
		if (adopt) {
			this.#cover();
			return adopt;
		}

		if (core.moving) {
			core.settle.stop();
			core.rest();
		}
		this.covering = false;
		this.#capture({ from, to });
	}

	prepareSwipeBack(): () => void {
		const staged = this.staged;
		if (!staged || this.moving) return () => {};

		this.#stopPreparing();
		const preparing = new AbortController();
		this.#preparing = preparing;
		this.#prepared = true;
		void tick().then(() => {
			if (!preparing.signal.aborted) staged.restore();
		});
		return this.#hideOnceQuiet(preparing);
	}

	beginSwipeBack(): boolean {
		return !this.covering && this.#core.begin();
	}

	trackSwipeBack(progress: number): void {
		this.#core.track(progress);
	}

	commitSwipeBack(release?: SwipeRelease): void {
		this.#core.commit(release);
	}

	cancelSwipeBack(release?: SwipeRelease): void {
		this.#core.cancel(release);
	}

	#capture({
		from,
		to,
	}: {
		from: NavigationTarget;
		to: NavigationTarget;
	}): void {
		const root = this.#root();
		const path = entryPathname(from.url.href);
		if (
			!root ||
			!this.#snapshots.accepts() ||
			!capturesScreen({ fromPath: path, toRoute: to.route.id })
		)
			return;

		const elements = root.getElementsByTagName("*").length;
		if (elements > SCREEN_ELEMENT_BUDGET) {
			console.info(
				`No swipe back to a screen of ${elements} elements, over the budget of ${SCREEN_ELEMENT_BUDGET}`,
			);
			return;
		}

		performance.mark(CAPTURE_START);
		const navBar = hidesNavBar(to.route.id) ? this.#navBar() : null;
		const snapshot = withFixup(snapshotScreen({ root, path, navBar }));
		this.#snapshots.remember({ snapshot, kind: "screen" });
		performance.measure(CAPTURE_MEASURE, {
			start: CAPTURE_START,
			detail: { elements },
		});
	}

	#cover(): void {
		this.#landing = openScreenLanding();
		this.covering = true;
		this.#front()?.style.removeProperty("transform");
	}

	async #land(): Promise<void> {
		const landing = this.#landing;
		if (!landing) return;
		closeScreenLanding(landing);

		const waiting = new AbortController();
		await Promise.race([
			landed({ landing, root: this.#root, signal: waiting.signal }),
			delay(LANDING_CAP_MS),
		]);
		waiting.abort();
		if (this.#landing !== landing) return;

		this.#landing = null;
		this.#core.rest();
		this.covering = false;
	}

	#stopLanding(): void {
		if (this.#landing) closeScreenLanding(this.#landing);
		this.#landing = null;
	}

	#hideOnceQuiet(preparing: AbortController): () => void {
		const { signal } = preparing;
		let touching = true;
		let undone = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const restart = () => {
			clearTimeout(timer);
			if (!undone || touching) return;
			timer = setTimeout(() => {
				preparing.abort();
				this.#prepared = false;
			}, PREPARED_QUIET_MS);
		};
		const touched = ({ touches }: TouchEvent) => {
			touching = touches.length > 0;
			restart();
		};
		const listening = { ...WATCHING, signal };
		addEventListener("touchstart", touched, listening);
		addEventListener("touchend", touched, listening);
		addEventListener("touchcancel", touched, listening);
		addEventListener("scroll", restart, listening);
		signal.addEventListener("abort", () => clearTimeout(timer));

		return () => {
			undone = true;
			restart();
		};
	}

	#stopPreparing(): void {
		this.#preparing?.abort();
		this.#preparing = null;
		this.#prepared = false;
	}
}
