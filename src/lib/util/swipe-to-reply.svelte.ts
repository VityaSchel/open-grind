import { isTauri } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { Spring } from "svelte/motion";
import type { Attachment } from "svelte/attachments";
import type { HTMLAttributes } from "svelte/elements";

import {
	scrollGesture,
	type ScrollGestureState,
} from "$lib/platform/scroll-gesture";

const TRIGGER_DISTANCE_PX = 64;
export const MAX_DRAG_PX = 92;
// Below this the gesture has not committed to an axis yet, so a vertical
// scroll can still claim it.
const AXIS_LOCK_SLOP_PX = 8;
// A mouse tick lands as one or two large jumps where trackpad fingers stream
// dozens of small deltas, so a gesture this short is not a swipe.
const RAIL_MIN_WHEEL_STEPS = 3;
// Trackpad gestures accelerate from small deltas; only a mouse opens with a
// jump this large. Classified at the first event so a hard flick's later
// large deltas stay welcome.
const RAIL_MOUSE_NOTCH_PX = 50;
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

export type WheelInputMode = "rail" | "bridge";

// macOS mirrors every scroll event's gesture phase from AppKit, so raw wheel
// deltas gated on finger contact replace the native scroller — which also
// stops the rail from latching vertical wheel gestures away from the
// conversation's own overscroll. Everywhere else the rail stays.
export function wheelInputMode(): WheelInputMode {
	return isTauri() && platform() === "macos" ? "bridge" : "rail";
}

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
	// the first wheel ever seen must classify as a gesture start
	#railLastWheelAt = Number.NEGATIVE_INFINITY;
	#railGestureIsMouse = false;
	#railSettling = false;
	#railFallback: ReturnType<typeof setTimeout> | undefined;

	readonly #wheelMode: WheelInputMode;
	readonly #gesture: ScrollGestureState;
	#bridgeToward = 0;
	#bridgeCross = 0;
	#bridgeAxis: "undecided" | "reply" | "scroll" = "undecided";
	#bridgeDrag = 0;

	constructor({
		direction,
		onReply,
		now = () => performance.now(),
		scrollEndSupported = typeof window !== "undefined" &&
			"onscrollend" in window,
		wheelMode = wheelInputMode(),
		gesture = scrollGesture,
	}: {
		direction: "left" | "right";
		onReply: () => void;
		now?: () => number;
		scrollEndSupported?: boolean;
		wheelMode?: WheelInputMode;
		gesture?: ScrollGestureState;
	}) {
		this.#dragSign = direction === "right" ? 1 : -1;
		this.#onReply = onReply;
		this.#now = now;
		this.#railHasScrollEnd = scrollEndSupported;
		this.#wheelMode = wheelMode;
		this.#gesture = gesture;
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
	// finger lift, not during a pause. Only a mouse's sideways jump is ever
	// cancelled, so every wheel that vertical scrolling or pull-to-refresh
	// may need passes through untouched.
	readonly attachRail: Attachment<HTMLElement> = (node) => {
		if (this.#wheelMode === "bridge") return this.#attachBridge(node);
		this.#rail = node;
		this.#railRest = this.#dragSign === 1 ? MAX_DRAG_PX : 0;
		node.scrollLeft = this.#railRest;
		const onScroll = () => this.#onRailScroll();
		const onScrollEnd = () => this.#onRailRelease();
		const onWheel = (event: WheelEvent) => this.#onRailWheel(event);
		node.addEventListener("scroll", onScroll, { passive: true });
		node.addEventListener("scrollend", onScrollEnd, { passive: true });
		// non-passive so a mouse's sideways jump can be cancelled before it
		// scrolls the rail; vertical-dominant wheels are never cancelled
		node.addEventListener("wheel", onWheel, { passive: false });
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
		if (!this.#railReturning && !this.#railSettling)
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
		const pixelMode = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
		const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
		const at = this.#now();
		if (at - this.#railLastWheelAt > RAIL_WHEEL_CHAIN_MS) {
			this.#railWheelSteps = 0;
			this.#railSettling = false;
			this.#railGestureIsMouse =
				!pixelMode ||
				(horizontal && Math.abs(event.deltaX) >= RAIL_MOUSE_NOTCH_PX);
		}
		this.#railLastWheelAt = at;
		// A released gesture's momentum keeps streaming wheels; letting them
		// through would re-drag the row it just returned, over and over.
		if (this.#railGestureIsMouse || this.#railSettling) {
			if (horizontal && event.cancelable) event.preventDefault();
			return;
		}
		// A user grabbing the row back mid-return owns it again.
		this.#railReturning = false;
		if (!pixelMode || !horizontal) return;
		this.#railWheelSteps += 1;
	}

	#onRailRelease(): void {
		clearTimeout(this.#railFallback);
		const commit =
			!this.#railReturning &&
			!this.#railSettling &&
			this.#railDrag > TRIGGER_DISTANCE_PX &&
			this.#railWheelSteps >= RAIL_MIN_WHEEL_STEPS;
		this.#railWheelSteps = 0;
		this.armed = false;
		if (this.#railDrag > 0) {
			this.#railSettling = true;
			this.#returnRail();
		} else {
			this.#railReturning = false;
		}
		if (commit) this.#onReply();
	}

	#returnRail(): void {
		this.#railReturning = true;
		this.#rail?.scrollTo({ left: this.#railRest, behavior: "smooth" });
	}

	// Nothing scrolls natively here, and nothing scrolls twice: each gesture
	// locks to ONE axis at its first decisive travel. A reply-locked gesture
	// has the monitor swallow the rest of the gesture at the source — no
	// cancelled wheels, no compositor fights — and tracks the drag in
	// AppKit's own scrollingDelta units — natural scroll speed, where DOM
	// deltas run hotter — while a scroll-locked gesture never touches the
	// row. Momentum and mice carry no finger phase and can never drag, and
	// the release evaluates the instant the fingers leave. Every listener is
	// passive and nothing is ever cancelled: WebKit hands wheels to
	// non-passive regions synchronously and degrades a gesture that starts
	// over or drifts into one, which froze the overscroll band mid-pull.
	#attachBridge(node: HTMLElement): () => void {
		const onWheel = (event: WheelEvent) => this.#onBridgeWheel(event);
		node.addEventListener("wheel", onWheel, { passive: true });
		const offRelease = this.#gesture.onRelease(() =>
			this.#onBridgeRelease(),
		);
		const offDelta = this.#gesture.onDelta((dx, dy) =>
			this.#onBridgeDelta(dx, dy),
		);
		return () => {
			node.removeEventListener("wheel", onWheel);
			offRelease();
			offDelta();
			this.#resetBridge();
		};
	}

	#onBridgeWheel(event: WheelEvent): void {
		if (!this.#gesture.fingersDown) return;
		if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return;
		if (this.#bridgeAxis === "undecided") {
			this.#bridgeToward += -event.deltaX * this.#dragSign;
			this.#bridgeCross += Math.abs(event.deltaY);
			// One decision, by dominance, the moment either axis clears the
			// slop. Racing separate thresholds instead let a vertical push
			// with a little sideways drift lock the reply and eat the scroll.
			// A perfect diagonal is a reply, by earlier decision.
			if (
				Math.max(this.#bridgeToward, this.#bridgeCross) >
				AXIS_LOCK_SLOP_PX
			) {
				this.#bridgeAxis =
					this.#bridgeToward >= this.#bridgeCross
						? "reply"
						: "scroll";
				if (this.#bridgeAxis === "reply") this.#gesture.capture(true);
			}
		}
	}

	#onBridgeDelta(dx: number, dy: number): void {
		void dy;
		if (this.#bridgeAxis !== "reply") return;
		this.#bridgeDrag = Math.min(
			Math.max(this.#bridgeDrag + dx * this.#dragSign, 0),
			MAX_DRAG_PX,
		);
		void this.#offset.set(this.#bridgeDrag * this.#dragSign, {
			instant: true,
		});
		this.armed = this.#bridgeDrag > TRIGGER_DISTANCE_PX;
	}

	#onBridgeRelease(): void {
		const commit =
			this.#bridgeAxis === "reply" &&
			this.#bridgeDrag > TRIGGER_DISTANCE_PX;
		this.#resetBridge();
		if (commit) this.#onReply();
	}

	#resetBridge(): void {
		this.#bridgeToward = 0;
		this.#bridgeCross = 0;
		this.#bridgeAxis = "undecided";
		this.#bridgeDrag = 0;
		this.armed = false;
		this.#gesture.capture(false);
		void this.#offset.set(0);
	}

	#onDown(event: PointerEvent): void {
		if (event.pointerType !== "touch") return;
		// a touch interrupting a held wheel drag cancels it, never commits it
		if (this.#railDrag > 0) {
			this.#railWheelSteps = 0;
			this.#onRailRelease();
		}
		if (this.#bridgeDrag > 0) this.#resetBridge();
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
