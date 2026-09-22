import { tick } from "svelte";
import type { NavigationTarget, OnNavigate } from "@sveltejs/kit";

import { CANCEL_EASING, COMMIT_EASING, settleDuration } from "./motion";
import type { FrameAnimation, StackSurface } from "./surface";

const BACK_WATCHDOG_MS = 1000;

export class LiveStack {
	leaving = $state<string | null>(null);
	moving = $state(false);
	tracking = $state(false);

	readonly #surface: StackSurface;
	readonly #top: () => string | null;
	readonly #keyOf: (target: NavigationTarget) => string | null;
	readonly #inScope: (pathname: string) => boolean;
	readonly #reducedMotion: () => boolean;
	readonly #backLandsOnBase: () => boolean;
	readonly #keyboardVisible: () => boolean;
	readonly #keyboardHidden: () => Promise<void>;

	#generation = 0;
	#backOwed = false;
	#progress = 0;
	#settling: FrameAnimation | null = null;
	#awaitingBack = false;
	#watchdog: ReturnType<typeof setTimeout> | undefined;

	constructor({
		surface,
		top,
		keyOf,
		inScope,
		reducedMotion,
		backLandsOnBase,
		keyboardVisible,
		keyboardHidden,
	}: {
		surface: StackSurface;
		top: () => string | null;
		keyOf: (target: NavigationTarget) => string | null;
		inScope: (pathname: string) => boolean;
		reducedMotion: () => boolean;
		backLandsOnBase: () => boolean;
		keyboardVisible: () => boolean;
		keyboardHidden: () => Promise<void>;
	}) {
		this.#surface = surface;
		this.#top = top;
		this.#keyOf = keyOf;
		this.#inScope = inScope;
		this.#reducedMotion = reducedMotion;
		this.#backLandsOnBase = backLandsOnBase;
		this.#keyboardVisible = keyboardVisible;
		this.#keyboardHidden = keyboardHidden;
		this.#progress = top() === null ? 1 : 0;
	}

	get covered(): boolean {
		return this.#top() !== null && !this.moving && !this.tracking;
	}

	get sheet(): string | null {
		return this.leaving ?? this.#top();
	}

	applyFrame(): void {
		this.#surface.apply(this.#progress);
	}

	async navigate(navigation: OnNavigate): Promise<(() => void) | void> {
		const { from, to } = navigation;
		if (!from || !to) return;

		const generation = ++this.#generation;
		this.tracking = false;
		this.#backOwed = false;
		this.#clearWatchdog();
		this.#stopSettling();

		const fromKey = this.#keyOf(from);
		const toKey = this.#keyOf(to);
		const staysInScope =
			this.#inScope(from.url.pathname) && this.#inScope(to.url.pathname);
		const opens = fromKey === null && toKey !== null;
		const closes = fromKey !== null && toKey === null;

		const swipedBack = this.#awaitingBack && staysInScope && closes;
		this.#awaitingBack = false;
		if (swipedBack) {
			return () => {
				if (generation === this.#generation) this.#rest(null);
			};
		}

		if (!staysInScope || !(opens || closes) || this.#reducedMotion()) {
			this.#rest(toKey);
			return;
		}

		if (!opens) this.leaving = fromKey;
		else if (this.leaving !== toKey) {
			this.leaving = null;
			this.#progress = 1;
		}
		this.moving = true;
		const waitForKeyboard = closes && this.#keyboardVisible();

		await tick();
		this.applyFrame();

		return () => {
			if (generation !== this.#generation) return;
			const ready = opens
				? new Promise((resolve) => requestAnimationFrame(resolve))
				: waitForKeyboard
					? this.#keyboardHidden()
					: Promise.resolve();
			void ready.then(() => {
				if (generation !== this.#generation) return;
				void this.#settleTo({
					target: opens ? 0 : 1,
					easing: COMMIT_EASING,
				}).then((settled) => {
					if (settled && generation === this.#generation)
						this.#rest(toKey);
				});
			});
		};
	}

	beginSwipeBack(): boolean {
		if (this.#backOwed) {
			this.#stopSettling();
			this.#progress = 1;
			this.applyFrame();
			this.#payBack();
			return false;
		}

		if (
			this.#top() === null ||
			this.leaving !== null ||
			this.moving ||
			!this.#backLandsOnBase()
		)
			return false;

		this.#stopSettling();
		this.#progress = 0;
		this.tracking = true;
		void tick().then(() => this.applyFrame());
		return true;
	}

	trackSwipeBack(progress: number): void {
		if (!this.tracking) return;
		this.#progress = Math.min(1, Math.max(0, progress));
		this.applyFrame();
	}

	commitSwipeBack(): void {
		if (!this.tracking) return;
		this.tracking = false;
		this.moving = true;
		this.#backOwed = true;
		const generation = this.#generation;
		void this.#settleTo({ target: 1, easing: COMMIT_EASING }).then(
			(settled) => {
				if (
					settled &&
					generation === this.#generation &&
					this.#backOwed
				)
					this.#payBack();
			},
		);
	}

	cancelSwipeBack(): void {
		if (!this.tracking) return;
		this.tracking = false;
		this.moving = true;
		this.#returnToCovered();
	}

	dispose(): void {
		this.#generation++;
		this.#backOwed = false;
		this.#stopSettling();
		this.#clearWatchdog();
		this.#awaitingBack = false;
		this.tracking = false;
	}

	#payBack(): void {
		this.#backOwed = false;
		this.#awaitingBack = true;
		this.#watchdog = setTimeout(
			() => this.#abandonBack(),
			BACK_WATCHDOG_MS,
		);
		history.back();
	}

	#abandonBack(): void {
		this.#watchdog = undefined;
		if (!this.#awaitingBack) return;
		this.#awaitingBack = false;
		this.#returnToCovered();
	}

	#returnToCovered(): void {
		const generation = this.#generation;
		void this.#settleTo({ target: 0, easing: CANCEL_EASING }).then(
			(settled) => {
				if (settled && generation === this.#generation)
					this.moving = false;
			},
		);
	}

	async #settleTo({
		target,
		easing,
	}: {
		target: number;
		easing: string;
	}): Promise<boolean> {
		this.#stopSettling();
		const animation = this.#surface.animate({
			from: this.#progress,
			to: target,
			duration: this.#reducedMotion()
				? 0
				: settleDuration(this.#progress, target),
			easing,
		});
		this.#settling = animation;
		if (!(await animation.completed)) return false;
		this.#settling = null;
		this.#progress = target;
		return true;
	}

	#stopSettling(): void {
		const progress = this.#settling?.cancel();
		this.#settling = null;
		if (progress !== undefined) this.#progress = progress;
	}

	#clearWatchdog(): void {
		clearTimeout(this.#watchdog);
		this.#watchdog = undefined;
	}

	#rest(top: string | null): void {
		this.leaving = null;
		this.moving = false;
		this.tracking = false;
		this.#progress = top === null ? 1 : 0;
		this.applyFrame();
	}
}
