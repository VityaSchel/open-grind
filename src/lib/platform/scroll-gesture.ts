import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ScrollGesturePhase = "idle" | "fingers" | "momentum";

export type ScrollGestureEvent = { state?: string; dx?: number; dy?: number };

// Mirrors src-tauri/src/scroll_phase.rs: whether trackpad scrolling is
// finger-driven, coasting, or over — the bit DOM wheel events strip. Finger
// deltas ride along in AppKit's scrollingDelta units, the speed a native
// scroller would move at, where DOM deltas run hotter. Where the bridge
// never emits (non-macOS, plain browsers, mice), the phase just stays idle.
export class ScrollGestureState {
	#phase: ScrollGesturePhase = "idle";
	readonly #releaseListeners = new Set<() => void>();
	readonly #deltaListeners = new Set<(dx: number, dy: number) => void>();

	get phase(): ScrollGesturePhase {
		return this.#phase;
	}

	get fingersDown(): boolean {
		return this.#phase === "fingers";
	}

	ingest({ state, dx, dy }: ScrollGestureEvent): void {
		if (state === "released") {
			this.#phase = "idle";
			for (const listener of this.#releaseListeners) listener();
			return;
		}
		if (state !== undefined)
			this.#phase =
				state === "fingers" || state === "momentum" ? state : "idle";
		if (this.#phase === "fingers" && dx !== undefined && dy !== undefined)
			for (const listener of this.#deltaListeners) listener(dx, dy);
	}

	onRelease(listener: () => void): () => void {
		this.#releaseListeners.add(listener);
		return () => this.#releaseListeners.delete(listener);
	}

	onDelta(listener: (dx: number, dy: number) => void): () => void {
		this.#deltaListeners.add(listener);
		return () => this.#deltaListeners.delete(listener);
	}

	// Asks the monitor to swallow the rest of the current gesture before
	// dispatch — the one suppression that neither cancels wheels nor fights
	// the compositor. The monitor drops the flag itself at gesture end.
	capture(on: boolean): void {
		if (!isTauri()) return;
		void invoke("scroll_gesture_capture", { capture: on }).catch(
			console.error,
		);
	}
}

export const scrollGesture = new ScrollGestureState();

let installed = false;

export function installScrollGestureBridge(): void {
	if (installed) return;
	installed = true;
	void listen<ScrollGestureEvent>("scroll:gesture", ({ payload }) => {
		if (import.meta.env.DEV && payload.state !== undefined)
			console.log(`[scroll-gesture] ${payload.state}`);
		scrollGesture.ingest(payload);
	}).catch(console.error);
}
