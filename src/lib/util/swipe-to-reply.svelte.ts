import { Spring } from "svelte/motion";
import type { HTMLAttributes } from "svelte/elements";

const TRIGGER_DISTANCE_PX = 64;
const MAX_DRAG_PX = 92;
// Below this the gesture has not committed to an axis yet, so a vertical
// scroll can still claim it.
const AXIS_LOCK_SLOP_PX = 8;

type SwipeHandlers = Pick<
	HTMLAttributes<HTMLElement>,
	| "onpointerdown"
	| "onpointermove"
	| "onpointerup"
	| "onpointercancel"
	| "onlostpointercapture"
>;

export class SwipeToReply {
	readonly #offset = new Spring(0, { stiffness: 0.4, damping: 0.75 });
	armed = $state(false);

	readonly #dragSign: 1 | -1;
	readonly #onReply: () => void;
	#pointerId: number | null = null;
	#startClientX = 0;
	#startClientY = 0;
	#axis: "undecided" | "horizontal" = "undecided";

	constructor({
		direction,
		onReply,
	}: {
		direction: "left" | "right";
		onReply: () => void;
	}) {
		this.#dragSign = direction === "right" ? 1 : -1;
		this.#onReply = onReply;
	}

	readonly handlers: SwipeHandlers = {
		onpointerdown: (event) => this.#onDown(event),
		onpointermove: (event) => this.#onMove(event),
		onpointerup: (event) => this.#onUp(event),
		// A cancelled gesture is not a release: releasing fires the reply,
		// cancelling must not.
		onpointercancel: (event) => this.#reset(event),
		onlostpointercapture: (event) => this.#reset(event),
	};

	#onDown(event: PointerEvent): void {
		if (event.pointerType !== "touch") return;
		this.#pointerId = event.pointerId;
		this.#startClientX = event.clientX;
		this.#startClientY = event.clientY;
		this.#axis = "undecided";
	}

	#onMove(event: PointerEvent): void {
		if (event.pointerId !== this.#pointerId) return;
		const deltaX = event.clientX - this.#startClientX;
		const deltaY = event.clientY - this.#startClientY;

		if (this.#axis === "undecided") {
			if (Math.abs(deltaY) > AXIS_LOCK_SLOP_PX) {
				this.#reset(event);
				return;
			}
			if (Math.abs(deltaX) <= AXIS_LOCK_SLOP_PX) return;
			this.#axis = "horizontal";
			// No setPointerCapture here: a touch is implicitly captured by
			// its target already, and transferring that capture fires a
			// bubbling lostpointercapture that our own safety net reads as
			// the gesture being taken away — cancelling every drag the
			// moment it commits.
		}

		const magnitude = Math.min(
			Math.max(deltaX * this.#dragSign, 0),
			MAX_DRAG_PX,
		);
		void this.#offset.set(magnitude * this.#dragSign, { instant: true });
		this.armed = magnitude > TRIGGER_DISTANCE_PX;
	}

	#onUp(event: PointerEvent): void {
		if (event.pointerId !== this.#pointerId) return;
		const shouldReply = this.armed;
		this.#release();
		if (shouldReply) this.#onReply();
	}

	#reset(event: PointerEvent): void {
		if (event.pointerId !== this.#pointerId) return;
		this.#release();
	}

	#release(): void {
		this.#pointerId = null;
		this.#axis = "undecided";
		this.armed = false;
		void this.#offset.set(0);
	}

	get deltaX(): number {
		return this.#offset.current;
	}

	get dragging(): boolean {
		return this.#axis === "horizontal";
	}

	get progress(): number {
		return Math.min(
			Math.abs(this.#offset.current) / TRIGGER_DISTANCE_PX,
			1,
		);
	}
}
