import { invoke } from "@tauri-apps/api/core";

import { touchHeld } from "#lib/platform/held-touch.ts";
import type {
	SystemBackAdapter,
	SystemBackGesture,
} from "#lib/platform/system-back-gesture.svelte.ts";

const PREPARED_MS = 1000;
const ARM_ORDERS_PER_MS = 1000;

const LISTENING = { capture: true, passive: true } as const;

type ActiveTouch = { pointerId: number; target: EventTarget };

function keepsTheTouch(origin: Element | null): boolean {
	for (let node = origin; node; node = node.parentElement)
		if (getComputedStyle(node).touchAction === "none") return true;
	return false;
}

export class IosSystemBack implements SystemBackAdapter {
	readonly passesOver = ["screen"] as const;

	#gesture: SystemBackGesture | null = null;
	#progress: number | undefined;
	#armed = false;
	#sentArmed = false;
	#sending = false;
	#armOrder = Date.now() * ARM_ORDERS_PER_MS;
	#touch: ActiveTouch | null = null;

	install(): void {
		window.__iosBack = {
			start: (point) => this.#start(point),
			progress: (progress) => {
				this.#progress = progress;
			},
			finish: (release) => this.#finish(release),
			prepare: () => this.#prepare(),
		};
		addEventListener("pointerdown", this.#noteTouch, LISTENING);
		addEventListener("pointerup", this.#forgetTouch, LISTENING);
		addEventListener("pointercancel", this.#forgetTouch, LISTENING);
	}

	readProgress(): number | undefined {
		return this.#progress;
	}

	expose(gesture: SystemBackGesture): () => void {
		this.#gesture = gesture;
		return () => {
			if (this.#gesture !== gesture) return;
			this.#gesture = null;
			this.#push(false);
		};
	}

	arm({ gesture, armed }: { gesture: SystemBackGesture; armed: boolean }) {
		if (gesture === this.#gesture) this.#push(armed);
	}

	#push(armed: boolean): void {
		this.#armed = armed;
		if (this.#sending) return;
		this.#sending = true;
		setTimeout(() => this.#send());
	}

	#send(): void {
		this.#sending = false;
		const armed = this.#armed;
		if (armed === this.#sentArmed) return;
		this.#sentArmed = armed;
		this.#armOrder += 1;
		invoke("set_back_swipe_armed", { armed, order: this.#armOrder }).catch(
			(error: unknown) => {
				console.error("Failed to arm the back swipe", error);
			},
		);
	}

	#start({ x, y }: { x: number; y: number }): boolean {
		const gesture = this.#gesture;
		const touch = this.#touch;
		const origin =
			touch?.target instanceof Element
				? touch.target
				: document.elementFromPoint(x, y);
		if (!gesture || touchHeld() || keepsTheTouch(origin)) return false;
		this.#progress = undefined;
		if (!gesture.start()) return false;
		if (touch) {
			this.#touch = null;
			touch.target.dispatchEvent(
				new PointerEvent("pointercancel", {
					pointerId: touch.pointerId,
					pointerType: "touch",
					isPrimary: true,
					bubbles: true,
				}),
			);
		}
		return true;
	}

	#finish(release: { commit: boolean; velocity: number }): void {
		this.#progress = undefined;
		this.#gesture?.finish(release);
	}

	#prepare(): void {
		const undo = this.#gesture?.prepare();
		if (!undo) return;
		const restoring = new AbortController();
		const restore = () => restoring.abort();
		const timer = setTimeout(restore, PREPARED_MS);
		restoring.signal.addEventListener("abort", () => {
			clearTimeout(timer);
			undo();
		});
		const until = { ...LISTENING, signal: restoring.signal };
		addEventListener("touchend", restore, until);
		addEventListener("touchcancel", restore, until);
	}

	readonly #noteTouch = (event: PointerEvent) => {
		if (event.pointerType !== "touch" || !event.isPrimary || !event.target)
			return;
		this.#touch = { pointerId: event.pointerId, target: event.target };
	};

	readonly #forgetTouch = (event: PointerEvent) => {
		if (event.pointerId === this.#touch?.pointerId) this.#touch = null;
	};
}

export const iosSystemBack = new IosSystemBack();
