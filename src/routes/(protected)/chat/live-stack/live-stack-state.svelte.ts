import { tick } from "svelte";
import type { NavigationTarget, OnNavigate } from "@sveltejs/kit";

import { StackSettle } from "$lib/components/navigation/stack/settle";
import { Generation } from "$lib/util/generation";
import { isWithin } from "$lib/util/pathname";
import type { StackMotion } from "$lib/components/navigation/stack/motion";
import type { StackSurface } from "$lib/components/navigation/stack/surface";

const BACK_WATCHDOG_MS = 1000;

export class LiveStackState {
	leaving = $state<string | null>(null);
	moving = $state(false);
	tracking = $state(false);

	readonly #settle: StackSettle;
	readonly #top: () => string | null;
	readonly #keyOf: (target: NavigationTarget) => string | null;
	readonly #scope: string;
	readonly #reducedMotion: () => boolean;
	readonly #backLandsOnBase: () => boolean;
	readonly #keyboardVisible: () => boolean;
	readonly #keyboardHidden: () => Promise<void>;

	#generation = new Generation();
	#committedSlide: Promise<boolean> | null = null;
	#watchdog: ReturnType<typeof setTimeout> | undefined;

	constructor({
		surface,
		motion,
		top,
		keyOf,
		scope,
		reducedMotion,
		backLandsOnBase,
		keyboardVisible,
		keyboardHidden,
	}: {
		surface: StackSurface;
		motion: StackMotion;
		top: () => string | null;
		keyOf: (target: NavigationTarget) => string | null;
		scope: string;
		reducedMotion: () => boolean;
		backLandsOnBase: () => boolean;
		keyboardVisible: () => boolean;
		keyboardHidden: () => Promise<void>;
	}) {
		this.#settle = new StackSettle({ surface, motion, reducedMotion });
		this.#top = top;
		this.#keyOf = keyOf;
		this.#scope = scope;
		this.#reducedMotion = reducedMotion;
		this.#backLandsOnBase = backLandsOnBase;
		this.#keyboardVisible = keyboardVisible;
		this.#keyboardHidden = keyboardHidden;
		this.#settle.progress = top() === null ? 1 : 0;
	}

	get covered(): boolean {
		return this.#top() !== null && !this.moving && !this.tracking;
	}

	get sheetOpen(): boolean {
		return this.#top() !== null;
	}

	get sheetKey(): string | null {
		return this.leaving ?? this.#top();
	}

	applyFrame(): void {
		this.#settle.apply();
	}

	async navigate(navigation: OnNavigate): Promise<(() => void) | void> {
		const { from, to } = navigation;
		if (!from || !to) return;

		const generation = this.#generation.next();
		this.tracking = false;
		this.#clearWatchdog();

		const fromKey = this.#keyOf(from);
		const toKey = this.#keyOf(to);
		const staysInScope =
			isWithin({ pathname: from.url.pathname, root: this.#scope }) &&
			isWithin({ pathname: to.url.pathname, root: this.#scope });
		const opens = fromKey === null && toKey !== null;
		const closes = fromKey !== null && toKey === null;

		const committedSlide = this.#committedSlide;
		this.#committedSlide = null;
		if (committedSlide && staysInScope && closes) {
			this.leaving = fromKey;
			return () => {
				void committedSlide.then((settled) => {
					if (settled && !this.#generation.isStale(generation))
						this.#rest(null);
				});
			};
		}
		this.#settle.stop();

		if (!staysInScope || !(opens || closes) || this.#reducedMotion()) {
			this.#rest(toKey);
			return;
		}

		if (!opens) this.leaving = fromKey;
		else if (this.leaving !== toKey) {
			this.leaving = null;
			this.#settle.progress = 1;
		}
		this.moving = true;
		const waitForKeyboard = closes && this.#keyboardVisible();

		await tick();
		this.applyFrame();

		return () => {
			if (this.#generation.isStale(generation)) return;
			if (opens) this.leaving = null;
			void this.#beforeSettle({ opens, waitForKeyboard }).then(() => {
				if (this.#generation.isStale(generation)) return;
				void this.#settle
					.settleTo({ target: opens ? 0 : 1, intent: "commit" })
					.then((settled) => {
						if (settled && !this.#generation.isStale(generation))
							this.#rest(toKey);
					});
			});
		};
	}

	beginSwipeBack(): boolean {
		if (
			this.#top() === null ||
			this.leaving !== null ||
			(this.moving && !this.#settle.settlingIn) ||
			!this.#backLandsOnBase()
		)
			return false;

		this.#settle.pickUp();
		this.moving = false;
		this.tracking = true;
		void tick().then(() => this.applyFrame());
		return true;
	}

	trackSwipeBack(progress: number): void {
		if (!this.tracking) return;
		this.#settle.track(progress);
	}

	commitSwipeBack(): void {
		if (!this.tracking) return;
		this.tracking = false;
		this.moving = true;
		this.#committedSlide = this.#settle.settleTo({
			target: 1,
			intent: "commit",
		});
		this.#watchdog = setTimeout(
			() => this.#abandonBack(),
			BACK_WATCHDOG_MS,
		);
		history.back();
	}

	cancelSwipeBack(): void {
		if (!this.tracking) return;
		this.tracking = false;
		this.moving = true;
		this.#returnToCovered();
	}

	dispose(): void {
		this.#generation.next();
		this.#settle.stop();
		this.#clearWatchdog();
		this.#committedSlide = null;
		this.tracking = false;
	}

	#abandonBack(): void {
		this.#watchdog = undefined;
		this.#committedSlide = null;
		this.#returnToCovered();
	}

	#returnToCovered(): void {
		const generation = this.#generation.current;
		void this.#settle
			.settleTo({ target: 0, intent: "cancel" })
			.then((settled) => {
				if (settled && !this.#generation.isStale(generation))
					this.moving = false;
			});
	}

	#beforeSettle({
		opens,
		waitForKeyboard,
	}: {
		opens: boolean;
		waitForKeyboard: boolean;
	}): Promise<unknown> {
		if (opens)
			return new Promise((resolve) => requestAnimationFrame(resolve));
		if (waitForKeyboard) return this.#keyboardHidden();
		return Promise.resolve();
	}

	#clearWatchdog(): void {
		clearTimeout(this.#watchdog);
		this.#watchdog = undefined;
	}

	#rest(top: string | null): void {
		this.leaving = null;
		this.moving = false;
		this.tracking = false;
		this.#settle.progress = top === null ? 1 : 0;
		this.applyFrame();
	}
}
