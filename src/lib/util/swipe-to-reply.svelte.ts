import { Spring } from "svelte/motion";
import type { Attachment } from "svelte/attachments";
import type { HTMLAttributes } from "svelte/elements";

const TRIGGER_DISTANCE_PX = 64;
export const MAX_DRAG_PX = 92;
// Below this the gesture has not committed to an axis yet, so a vertical
// scroll can still claim it.
const AXIS_LOCK_SLOP_PX = 8;
// A mouse tick lands as one or two large jumps where trackpad fingers stream
// dozens of small deltas, so a gesture this short is not a swipe.
const RAIL_MIN_WHEEL_STEPS = 3;
// Wheel events further apart than this belong to separate gestures; without
// the window, steps left over from an abandoned wiggle would let a lone mouse
// tick commit.
const RAIL_WHEEL_CHAIN_MS = 300;
// Engines without scrollend (Chromium < 114) get a quiet gap as the release
// signal instead. Trackpad fingers resting still emit nothing but also fire no
// scrollend, so on scrollend engines a pause must NOT release the gesture.
const RAIL_RELEASE_FALLBACK_MS = 250;

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
	readonly #now: () => number;
	#pointerId: number | null = null;
	#startClientX = 0;
	#startClientY = 0;
	#axis: "undecided" | "horizontal" = "undecided";

	#rail: HTMLElement | null = null;
	#railRest = 0;
	#railDrag = $state(0);
	#railReturning = false;
	readonly #railHasScrollEnd: boolean;
	#railWheelSteps = 0;
	#railLastWheelAt = 0;
	#railFallback: ReturnType<typeof setTimeout> | undefined;

	constructor({
		direction,
		onReply,
		now = () => performance.now(),
		scrollEndSupported = typeof window !== "undefined" &&
			"onscrollend" in window,
	}: {
		direction: "left" | "right";
		onReply: () => void;
		now?: () => number;
		scrollEndSupported?: boolean;
	}) {
		this.#dragSign = direction === "right" ? 1 : -1;
		this.#onReply = onReply;
		this.#now = now;
		this.#railHasScrollEnd = scrollEndSupported;
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

	// A trackpad drag rides the row's own scroller: a real scroll position
	// holds still while resting fingers emit nothing, and scrollend fires on
	// finger lift, not during a pause. Nothing here calls preventDefault, so
	// unconsumed wheels reach the conversation's pull-to-refresh untouched.
	readonly attachRail: Attachment<HTMLElement> = (node) => {
		this.#rail = node;
		this.#railRest = this.#dragSign === 1 ? MAX_DRAG_PX : 0;
		node.scrollLeft = this.#railRest;
		const onScroll = () => this.#onRailScroll();
		const onScrollEnd = () => this.#onRailRelease();
		const onWheel = (event: WheelEvent) => this.#onRailWheel(event);
		node.addEventListener("scroll", onScroll, { passive: true });
		node.addEventListener("scrollend", onScrollEnd, { passive: true });
		node.addEventListener("wheel", onWheel, { passive: true });
		return () => {
			node.removeEventListener("scroll", onScroll);
			node.removeEventListener("scrollend", onScrollEnd);
			node.removeEventListener("wheel", onWheel);
			clearTimeout(this.#railFallback);
			this.#rail = null;
			this.#railDrag = 0;
		};
	};

	#onRailScroll(): void {
		const rail = this.#rail;
		if (!rail) return;
		const drag = (rail.scrollLeft - this.#railRest) * -this.#dragSign;
		this.#railDrag = Math.max(drag, 0);
		if (!this.#railReturning)
			this.armed = this.#railDrag > TRIGGER_DISTANCE_PX;
		if (!this.#railHasScrollEnd) {
			clearTimeout(this.#railFallback);
			this.#railFallback = setTimeout(
				() => this.#onRailRelease(),
				RAIL_RELEASE_FALLBACK_MS,
			);
		}
	}

	#onRailWheel(event: WheelEvent): void {
		// A user grabbing the row back mid-return owns it again.
		this.#railReturning = false;
		if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return;
		if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
		const at = this.#now();
		if (at - this.#railLastWheelAt > RAIL_WHEEL_CHAIN_MS)
			this.#railWheelSteps = 0;
		this.#railLastWheelAt = at;
		this.#railWheelSteps += 1;
	}

	#onRailRelease(): void {
		clearTimeout(this.#railFallback);
		const commit =
			!this.#railReturning &&
			this.#railDrag > TRIGGER_DISTANCE_PX &&
			this.#railWheelSteps >= RAIL_MIN_WHEEL_STEPS;
		this.#railWheelSteps = 0;
		this.armed = false;
		if (this.#railDrag > 0) this.#returnRail();
		else this.#railReturning = false;
		if (commit) this.#onReply();
	}

	#returnRail(): void {
		this.#railReturning = true;
		this.#rail?.scrollTo({ left: this.#railRest, behavior: "smooth" });
	}

	#onDown(event: PointerEvent): void {
		if (event.pointerType !== "touch") return;
		// a touch interrupting a held wheel drag cancels it, never commits it
		if (this.#railDrag > 0) {
			this.#railWheelSteps = 0;
			this.#onRailRelease();
		}
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
		return this.#axis === "horizontal" || this.#railDrag > 0;
	}

	get progress(): number {
		return Math.min(
			Math.max(Math.abs(this.#offset.current), this.#railDrag) /
				TRIGGER_DISTANCE_PX,
			1,
		);
	}
}
