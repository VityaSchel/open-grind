export type PullSource = "touch" | "overscroll" | "click";
export type PullPhase = "idle" | "pulling" | "armed" | "refreshing";
export type PullOutcome = "triggered" | "canceled";

const RESISTANCE_PX = 96;
const OVERSHOOT = 1.5;
const ARM_RAW_PX = RESISTANCE_PX * Math.log(OVERSHOOT / (OVERSHOOT - 1));
const MIN_REFRESHING_MS = 500;

export class PullModel {
	phase: PullPhase = $state("idle");
	source: PullSource | null = $state(null);
	displayPx = $state(0);
	space = $state(0);
	updating = $state(false);

	settledFrom: PullSource | null = $state(null);
	settledOutcome: PullOutcome | null = $state(null);

	onTrigger?: () => void;
	getBaseline?: () => number;

	#baseline = 0;
	#triggeredAt = 0;
	#now: () => number;

	constructor({ now }: { now?: () => number } = {}) {
		this.#now = now ?? (() => performance.now());
	}

	get gestureActive(): boolean {
		return this.phase === "pulling" || this.phase === "armed";
	}

	get busy(): boolean {
		return this.updating || this.phase === "refreshing";
	}

	setUpdating(updating: boolean): void {
		const startsFreshEpisode =
			updating && !this.busy && !this.gestureActive;
		if (startsFreshEpisode) this.#clearSettled();
		this.updating = updating;
	}

	beginPull(source: Exclude<PullSource, "click">): boolean {
		if (this.busy || this.gestureActive) return false;
		this.source = source;
		this.#clearSettled();
		this.#baseline = Math.max(0, this.getBaseline?.() ?? 0);
		this.displayPx = this.#baseline;
		this.phase = "pulling";
		return true;
	}

	updatePull(rawPx: number, { preResisted = false } = {}): void {
		if (!this.gestureActive) return;
		const pull = Math.max(0, rawPx);
		if (preResisted) {
			this.displayPx = pull;
			this.phase =
				this.space > 0 && pull >= this.space ? "armed" : "pulling";
			return;
		}
		const range = Math.max(0, this.space * OVERSHOOT - this.#baseline);
		this.displayPx =
			this.#baseline + range * (1 - Math.exp(-pull / RESISTANCE_PX));
		this.phase = this.space > 0 && pull >= ARM_RAW_PX ? "armed" : "pulling";
	}

	release(): void {
		if (!this.gestureActive) return;
		if (this.phase === "armed") this.#fire();
		else this.cancel();
	}

	cancel(): void {
		if (!this.gestureActive) return;
		this.#settle("canceled");
		this.phase = "idle";
	}

	trigger(): void {
		if (!this.gestureActive) return;
		this.#fire();
	}

	clickTrigger(): void {
		if (this.busy || this.gestureActive) return;
		this.source = "click";
		this.#fire();
	}

	finishRefresh(): void {
		if (this.phase !== "refreshing") return;
		this.phase = "idle";
	}

	remainingRefreshMs(): number {
		return Math.max(
			0,
			MIN_REFRESHING_MS - (this.#now() - this.#triggeredAt),
		);
	}

	#fire(): void {
		this.#settle("triggered");
		this.phase = "refreshing";
		this.#triggeredAt = this.#now();
		this.displayPx = 0;
		this.onTrigger?.();
	}

	#settle(outcome: PullOutcome): void {
		this.settledFrom = this.source;
		this.settledOutcome = outcome;
		this.source = null;
		if (outcome === "canceled") this.displayPx = 0;
	}

	#clearSettled(): void {
		this.settledFrom = null;
		this.settledOutcome = null;
	}
}
