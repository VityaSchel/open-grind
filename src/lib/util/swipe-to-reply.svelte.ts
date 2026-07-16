import { type GestureCustomEvent, usePan } from "svelte-gestures";
import { Spring } from "svelte/motion";

const TRIGGER_DISTANCE_PX = 64;
const MAX_DRAG_PX = 92;

export class SwipeToReply {
	readonly #offset = new Spring(0, { stiffness: 0.4, damping: 0.75 });
	armed = $state(false);

	readonly #dragSign: 1 | -1;
	readonly #onReply: () => void;
	readonly #isMobile = navigator.maxTouchPoints > 0;
	#startClientX = 0;
	#active = false;

	constructor(direction: "left" | "right", onReply: () => void) {
		this.#dragSign = direction === "right" ? 1 : -1;
		this.#onReply = onReply;
	}

	readonly handlers = usePan(
		() => {},
		() => ({ touchAction: "pan-y" }),
		{
			onpandown: (event) => this.#onDown(event),
			onpanmove: (event) => this.#onMove(event),
			onpanup: () => this.#onUp(),
		},
	);

	#onDown(event: GestureCustomEvent): void {
		if (event.detail.event.pointerType === "mouse" && this.#isMobile)
			return;
		this.#active = true;
		this.#startClientX = event.detail.event.clientX;
	}

	#onMove(event: GestureCustomEvent): void {
		if (!this.#active) return;
		const delta =
			(event.detail.event.clientX - this.#startClientX) * this.#dragSign;
		const magnitude = Math.min(Math.max(delta, 0), MAX_DRAG_PX);
		void this.#offset.set(magnitude * this.#dragSign, { instant: true });
		this.armed = magnitude > TRIGGER_DISTANCE_PX;
	}

	#onUp(): void {
		if (!this.#active) return;
		if (this.armed) this.#onReply();
		this.armed = false;
		this.#active = false;
		void this.#offset.set(0);
	}

	get deltaX(): number {
		return this.#offset.current;
	}

	get progress(): number {
		return Math.min(
			Math.abs(this.#offset.current) / TRIGGER_DISTANCE_PX,
			1,
		);
	}
}
