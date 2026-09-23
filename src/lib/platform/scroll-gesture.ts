import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ScrollGesturePhase = "idle" | "fingers" | "momentum";

export type ScrollGestureEvent = { state?: string; dx?: number; dy?: number };

export class ScrollGestureState {
	#phase: ScrollGesturePhase = "idle";
	readonly #releaseListeners = new Set<() => void>();
	readonly #phaseListeners = new Set<(phase: ScrollGesturePhase) => void>();
	readonly #deltaListeners = new Set<(dx: number, dy: number) => void>();

	get phase(): ScrollGesturePhase {
		return this.#phase;
	}

	get fingersDown(): boolean {
		return this.#phase === "fingers";
	}

	ingest({ state, dx, dy }: ScrollGestureEvent): void {
		if (state === "released") {
			this.#setPhase("idle");
			for (const listener of this.#releaseListeners) listener();
			return;
		}
		if (state !== undefined)
			this.#setPhase(
				state === "fingers" || state === "momentum" ? state : "idle",
			);
		if (this.#phase === "fingers" && dx !== undefined && dy !== undefined)
			for (const listener of this.#deltaListeners) listener(dx, dy);
	}

	#setPhase(phase: ScrollGesturePhase): void {
		if (phase === this.#phase) return;
		this.#phase = phase;
		for (const listener of this.#phaseListeners) listener(phase);
	}

	onPhaseChange(listener: (phase: ScrollGesturePhase) => void): () => void {
		this.#phaseListeners.add(listener);
		return () => this.#phaseListeners.delete(listener);
	}

	onRelease(listener: () => void): () => void {
		this.#releaseListeners.add(listener);
		return () => this.#releaseListeners.delete(listener);
	}

	onDelta(listener: (dx: number, dy: number) => void): () => void {
		this.#deltaListeners.add(listener);
		return () => this.#deltaListeners.delete(listener);
	}

	capture(on: boolean): void {
		if (!isTauri()) return;
		void invoke("set_scroll_gesture_capture", { capture: on }).catch(
			console.error,
		);
	}
}

export const scrollGesture = new ScrollGestureState();

let installed = false;

export function installScrollGestureBridge(): void {
	if (installed) return;
	installed = true;
	void listen<ScrollGestureEvent>("scroll:gesture", ({ payload }) =>
		scrollGesture.ingest(payload),
	).catch(console.error);
}
