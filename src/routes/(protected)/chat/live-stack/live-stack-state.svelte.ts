import { tick } from "svelte";
import type { NavigationTarget, OnNavigate } from "@sveltejs/kit";

import {
	CANCEL_EASING,
	COMMIT_EASING,
} from "$lib/components/navigation/stack/motion";
import { StackSettle } from "$lib/components/navigation/stack/settle";
import { isWithin } from "$lib/util/pathname";
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

	#generation = 0;
	#backOwed = false;
	#awaitingBack = false;
	#watchdog: ReturnType<typeof setTimeout> | undefined;

	constructor({
		surface,
		top,
		keyOf,
		scope,
		reducedMotion,
		backLandsOnBase,
		keyboardVisible,
		keyboardHidden,
	}: {
		surface: StackSurface;
		top: () => string | null;
		keyOf: (target: NavigationTarget) => string | null;
		scope: string;
		reducedMotion: () => boolean;
		backLandsOnBase: () => boolean;
		keyboardVisible: () => boolean;
		keyboardHidden: () => Promise<void>;
	}) {
		this.#settle = new StackSettle({ surface, reducedMotion });
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

	get sheetKey(): string | null {
		return this.leaving ?? this.#top();
	}

	applyFrame(): void {
		this.#settle.apply();
	}

	async navigate(navigation: OnNavigate): Promise<(() => void) | void> {
		const { from, to } = navigation;
		if (!from || !to) return;

		const generation = ++this.#generation;
		this.tracking = false;
		this.#backOwed = false;
		this.#clearWatchdog();
		this.#settle.stop();

		const fromKey = this.#keyOf(from);
		const toKey = this.#keyOf(to);
		const staysInScope =
			isWithin({ pathname: from.url.pathname, root: this.#scope }) &&
			isWithin({ pathname: to.url.pathname, root: this.#scope });
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
			this.#settle.progress = 1;
		}
		this.moving = true;
		const waitForKeyboard = closes && this.#keyboardVisible();

		await tick();
		this.applyFrame();

		return () => {
			if (generation !== this.#generation) return;
			void this.#beforeSettle({ opens, waitForKeyboard }).then(() => {
				if (generation !== this.#generation) return;
				void this.#settle
					.settleTo({ target: opens ? 0 : 1, easing: COMMIT_EASING })
					.then((settled) => {
						if (settled && generation === this.#generation)
							this.#rest(toKey);
					});
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

		if (
			this.#top() === null ||
			this.leaving !== null ||
			this.moving ||
			!this.#backLandsOnBase()
		)
			return false;

		this.#settle.stop();
		this.#settle.progress = 0;
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
		this.#backOwed = true;
		const generation = this.#generation;
		void this.#settle
			.settleTo({ target: 1, easing: COMMIT_EASING })
			.then((settled) => {
				if (
					settled &&
					generation === this.#generation &&
					this.#backOwed
				)
					this.#payBack();
			});
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
		this.#settle.stop();
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
		void this.#settle
			.settleTo({ target: 0, easing: CANCEL_EASING })
			.then((settled) => {
				if (settled && generation === this.#generation)
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
