import { Spring } from "svelte/motion";
import type { HTMLAttributes } from "svelte/elements";

const TRIGGER_DISTANCE_PX = 64;
const MAX_DRAG_PX = 92;
// Below this the gesture has not committed to an axis yet, so a vertical
// scroll can still claim it.
const AXIS_LOCK_SLOP_PX = 8;
// A trackpad swipe has no release, so a quiet gap is what ends it. Momentum
// keeps arriving after the fingers lift and every wheel restarts the clock, so
// one flick's tail can never open a second gesture.
const WHEEL_REST_MS = 150;
// A mouse tick arrives as one large jump, in the same pixel mode a trackpad
// uses, while fingers stream many small ones.
const WHEEL_NOTCH_PX = 50;
const WHEEL_MIN_STEPS = 3;
const WHEEL_PIXEL_MODE = 0;

type SwipeHandlers = Pick<
	HTMLAttributes<HTMLElement>,
	| "onpointerdown"
	| "onpointermove"
	| "onpointerup"
	| "onpointercancel"
	| "onlostpointercapture"
	| "onwheel"
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
	#wheelAxis: "undecided" | "horizontal" | "declined" = "undecided";
	#wheelDistance = 0;
	#wheelCross = 0;
	#wheelSteps = 0;
	#wheelReplied = false;
	#wheelRest: ReturnType<typeof setTimeout> | undefined;

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
		onwheel: (event) => this.#onWheel(event),
	};

	#onDown(event: PointerEvent): void {
		if (event.pointerType !== "touch") return;
		this.#endWheelGesture();
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

	#onWheel(event: WheelEvent): void {
		if (event.deltaMode !== WHEEL_PIXEL_MODE) return;
		if (this.#pointerId !== null) return;

		clearTimeout(this.#wheelRest);
		this.#wheelRest = setTimeout(
			() => this.#endWheelGesture(),
			WHEEL_REST_MS,
		);

		if (this.#wheelAxis === "declined") return;
		if (this.#wheelReplied) {
			this.#consumeWheel(event);
			return;
		}
		if (Math.abs(event.deltaX) >= WHEEL_NOTCH_PX) {
			this.#declineWheel();
			return;
		}

		// A wheel delta points the way the content scrolls, the opposite of the
		// way the fingers travel.
		this.#wheelSteps += 1;
		this.#wheelDistance = Math.max(
			Math.min(
				this.#wheelDistance - event.deltaX * this.#dragSign,
				MAX_DRAG_PX,
			),
			-MAX_DRAG_PX,
		);
		this.#wheelCross += event.deltaY;

		if (this.#wheelAxis === "undecided") {
			if (Math.abs(this.#wheelCross) > AXIS_LOCK_SLOP_PX) {
				this.#declineWheel();
				return;
			}
			if (Math.abs(this.#wheelDistance) <= AXIS_LOCK_SLOP_PX) return;
			this.#wheelAxis = "horizontal";
		}

		this.#consumeWheel(event);
		const magnitude = Math.min(
			Math.max(this.#wheelDistance, 0),
			MAX_DRAG_PX,
		);
		void this.#offset.set(magnitude * this.#dragSign, { instant: true });
		if (magnitude <= TRIGGER_DISTANCE_PX) return;
		if (this.#wheelSteps < WHEEL_MIN_STEPS) return;

		// Nothing releases a wheel, so crossing the trigger is the commit and
		// the rest of the flick is swallowed rather than replied to again.
		this.#wheelReplied = true;
		this.#wheelDistance = 0;
		void this.#offset.set(0);
		this.#onReply();
	}

	#consumeWheel(event: WheelEvent): void {
		if (event.cancelable) event.preventDefault();
	}

	#declineWheel(): void {
		this.#wheelAxis = "declined";
		this.#wheelDistance = 0;
		void this.#offset.set(0);
	}

	#endWheelGesture(): void {
		clearTimeout(this.#wheelRest);
		this.#wheelRest = undefined;
		this.#wheelAxis = "undecided";
		this.#wheelDistance = 0;
		this.#wheelCross = 0;
		this.#wheelSteps = 0;
		this.#wheelReplied = false;
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
